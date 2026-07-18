import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowTimeoutConfigDto } from './dto/workflow.dto';

export interface TimeoutProcessResult {
  processed: number;
  approved: number;
  rejected: number;
  escalated: number;
  errors: Array<{ workflowId: string; error: string }>;
}

export interface ReminderProcessResult {
  sent: number;
  skipped: number;
  errors: Array<{ workflowId: string; error: string }>;
}

@Injectable()
export class WorkflowTimeoutService {
  private readonly logger = new Logger(WorkflowTimeoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /** Update timeout configuration for a workflow. Validates ESCALATE requires escalateTo. */
  async setConfig(id: string, dto: WorkflowTimeoutConfigDto) {
    const workflow = await this.prisma.workflow.findUnique({ where: { id } });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    if (dto.timeoutAction === 'ESCALATE' && !dto.escalateTo) {
      throw new BadRequestException('escalateTo is required when timeoutAction is ESCALATE');
    }
    return this.prisma.workflow.update({
      where: { id },
      data: {
        timeoutHours: dto.timeoutHours ?? null,
        timeoutAction: dto.timeoutAction ?? null,
        escalateTo: dto.escalateTo ?? null,
      },
    });
  }

  /**
   * Find all PENDING workflows that have exceeded their timeout window and
   * apply the configured auto-action (APPROVE / REJECT / ESCALATE).
   *
   * Called by a scheduled worker tick (e.g. every few minutes).
   */
  async processTimeouts(now: Date = new Date()): Promise<TimeoutProcessResult> {
    const result: TimeoutProcessResult = {
      processed: 0,
      approved: 0,
      rejected: 0,
      escalated: 0,
      errors: [],
    };

    const pending = await this.prisma.workflow.findMany({
      where: {
        status: 'PENDING',
        timeoutAction: { not: null },
        timeoutHours: { not: null },
      },
    });

    for (const wf of pending) {
      const timeoutMs = (wf.timeoutHours as number) * 60 * 60 * 1000;
      const deadline = new Date(wf.createdAt.getTime() + timeoutMs);

      if (now < deadline) continue;

      try {
        switch (wf.timeoutAction) {
          case 'APPROVE':
            await this.autoApprove(wf.id, wf.contentId);
            result.approved++;
            break;
          case 'REJECT':
            await this.autoReject(wf.id, wf.contentId);
            result.rejected++;
            break;
          case 'ESCALATE':
            await this.autoEscalate(wf.id, wf.contentId, wf.escalateTo);
            result.escalated++;
            break;
          default:
            this.logger.warn(`Unknown timeout action "${wf.timeoutAction}" for workflow ${wf.id}`);
            continue;
        }
        result.processed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Timeout processing failed for workflow ${wf.id}: ${message}`);
        result.errors.push({ workflowId: wf.id, error: message });
      }
    }

    if (result.processed > 0) {
      this.logger.log(
        `Timeout sweep: ${result.processed} processed (approve=${result.approved}, reject=${result.rejected}, escalate=${result.escalated}), ${result.errors.length} errors`,
      );
    }

    return result;
  }

  /**
   * Send reminder notifications for PENDING workflows that are approaching
   * their timeout deadline (within `windowHours` from now) and have not yet
   * had a first reminder sent.
   */
  async sendReminders(
    windowHours = 24,
    now: Date = new Date(),
  ): Promise<ReminderProcessResult> {
    const result: ReminderProcessResult = { sent: 0, skipped: 0, errors: [] };

    const pending = await this.prisma.workflow.findMany({
      where: {
        status: 'PENDING',
        timeoutHours: { not: null },
        firstReminderAt: null,
      },
    });

    for (const wf of pending) {
      const timeoutMs = (wf.timeoutHours as number) * 60 * 60 * 1000;
      const deadline = new Date(wf.createdAt.getTime() + timeoutMs);
      const reminderAt = new Date(deadline.getTime() - windowHours * 60 * 60 * 1000);

      if (now < reminderAt) continue;

      try {
        await this.notifyReminder(wf.id, wf.approverId, deadline);
        await this.prisma.workflow.update({
          where: { id: wf.id },
          data: { firstReminderAt: now },
        });
        result.sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Reminder failed for workflow ${wf.id}: ${message}`);
        result.errors.push({ workflowId: wf.id, error: message });
      }
    }

    if (result.sent > 0) {
      this.logger.log(`Reminder sweep: ${result.sent} sent, ${result.errors.length} errors`);
    }

    return result;
  }

  /**
   * List workflows grouped by timeout status: overdue (past deadline),
   * approaching (within windowHours of deadline), and ok.
   */
  async getTimeoutSummary(windowHours = 24, now: Date = new Date()) {
    const pending = await this.prisma.workflow.findMany({
      where: { status: 'PENDING', timeoutHours: { not: null } },
      select: {
        id: true,
        contentId: true,
        approverId: true,
        status: true,
        timeoutHours: true,
        timeoutAction: true,
        escalateTo: true,
        firstReminderAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const overdue: typeof pending = [];
    const approaching: typeof pending = [];
    const ok: typeof pending = [];

    for (const wf of pending) {
      const timeoutMs = (wf.timeoutHours as number) * 60 * 60 * 1000;
      const deadline = new Date(wf.createdAt.getTime() + timeoutMs);
      const reminderAt = new Date(deadline.getTime() - windowHours * 60 * 60 * 1000);

      if (now >= deadline) {
        overdue.push(wf);
      } else if (now >= reminderAt) {
        approaching.push(wf);
      } else {
        ok.push(wf);
      }
    }

    return { overdue, approaching, ok, total: pending.length };
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async autoApprove(workflowId: string, contentId: string | null) {
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: { status: 'APPROVED', comment: 'Auto-approved (timeout)' },
    });
    await this.audit.log('workflow.timeout.auto_approve', 'system', 'Workflow', workflowId, {
      contentId,
    });
    await this.broadcastTeamNotification(
      contentId,
      'Workflow auto-approved',
      `Workflow ${workflowId} was auto-approved after timeout`,
      'warning',
    );
  }

  private async autoReject(workflowId: string, contentId: string | null) {
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: { status: 'REJECTED', comment: 'Auto-rejected (timeout)' },
    });
    await this.audit.log('workflow.timeout.auto_reject', 'system', 'Workflow', workflowId, {
      contentId,
    });
    await this.broadcastTeamNotification(
      contentId,
      'Workflow auto-rejected',
      `Workflow ${workflowId} was auto-rejected after timeout`,
      'warning',
    );
  }

  private async autoEscalate(workflowId: string, contentId: string | null, escalateTo: string | null) {
    if (!escalateTo) {
      throw new Error(`Cannot escalate workflow ${workflowId}: escalateTo is not set`);
    }
    // Verify the target user exists
    const target = await this.prisma.user.findUnique({
      where: { id: escalateTo },
      select: { id: true },
    });
    if (!target) {
      throw new Error(`Escalation target user ${escalateTo} not found`);
    }

    // Reassign the workflow to the escalation target (keeps it PENDING)
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: { approverId: escalateTo },
    });
    await this.audit.log('workflow.timeout.escalate', 'system', 'Workflow', workflowId, {
      contentId,
      escalateTo,
    });
    await this.broadcastTeamNotification(
      contentId,
      'Workflow escalated',
      `Workflow ${workflowId} was escalated to user ${escalateTo} after timeout`,
      'warning',
    );
  }

  private async notifyReminder(workflowId: string, approverId: string, deadline: Date) {
    const deadlineIso = deadline.toISOString();
    await this.notification.create({
      userId: approverId,
      type: 'warning',
      title: 'Approval timeout approaching',
      body: `Workflow ${workflowId} will auto-expire at ${deadlineIso}. Please review before the deadline.`,
    });
  }

  /**
   * Resolve the team for a content item and broadcast a notification to all
   * team members. Falls back to notifying the approver when contentId is null.
   */
  private async broadcastTeamNotification(
    contentId: string | null,
    title: string,
    body: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'warning',
  ) {
    if (!contentId) return;
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { teamId: true },
    });
    if (!content?.teamId) return;
    await this.notification.broadcastToTeam(content.teamId, { title, body, type });
  }
}
