import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowTimeoutService } from './workflow-timeout.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = () => ({
  workflow: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  content: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
});

const mockNotification = () => ({
  create: jest.fn(),
  broadcastToTeam: jest.fn(),
});

const mockAudit = () => ({
  log: jest.fn(),
});

describe('WorkflowTimeoutService', () => {
  let service: WorkflowTimeoutService;
  let prisma: ReturnType<typeof mockPrisma>;
  let notification: ReturnType<typeof mockNotification>;
  let audit: ReturnType<typeof mockAudit>;

  beforeEach(async () => {
    prisma = mockPrisma();
    notification = mockNotification();
    audit = mockAudit();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowTimeoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notification },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(WorkflowTimeoutService);
  });

  // ── setConfig ──────────────────────────────────────────────────

  describe('setConfig', () => {
    const workflow = { id: 'wf-1', status: 'PENDING' };

    it('sets timeout config on an existing PENDING workflow', async () => {
      prisma.workflow.findUnique.mockResolvedValue(workflow);
      prisma.workflow.update.mockResolvedValue({ ...workflow, timeoutHours: 72, timeoutAction: 'APPROVE' });

      const result = await service.setConfig('wf-1', { timeoutHours: 72, timeoutAction: 'APPROVE' });

      expect(prisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'wf-1' },
        data: { timeoutHours: 72, timeoutAction: 'APPROVE', escalateTo: null },
      });
      expect(result.timeoutAction).toBe('APPROVE');
    });

    it('throws NotFound when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.setConfig('ghost', { timeoutHours: 24 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequest when ESCALATE is set without escalateTo', async () => {
      prisma.workflow.findUnique.mockResolvedValue(workflow);

      await expect(
        service.setConfig('wf-1', { timeoutAction: 'ESCALATE' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── processTimeouts ────────────────────────────────────────────

  describe('processTimeouts', () => {
    const baseTime = new Date('2026-07-18T12:00:00Z');
    const overdue = {
      id: 'wf-overdue',
      contentId: 'c-1',
      approverId: 'u-1',
      status: 'PENDING',
      timeoutHours: 48,
      timeoutAction: 'APPROVE',
      escalateTo: null,
      firstReminderAt: null,
      createdAt: new Date(baseTime.getTime() - 49 * 60 * 60 * 1000), // 49h ago
    };
    const notYet = {
      id: 'wf-notyet',
      contentId: 'c-2',
      approverId: 'u-1',
      status: 'PENDING',
      timeoutHours: 48,
      timeoutAction: 'APPROVE',
      escalateTo: null,
      firstReminderAt: null,
      createdAt: new Date(baseTime.getTime() - 10 * 60 * 60 * 1000), // 10h ago
    };

    it('auto-approves workflows past their deadline (APPROVE action)', async () => {
      prisma.workflow.findMany.mockResolvedValue([overdue]);
      prisma.workflow.update.mockResolvedValue({ ...overdue, status: 'APPROVED' });
      prisma.content.findUnique.mockResolvedValue({ teamId: 'team-1' });

      const result = await service.processTimeouts(baseTime);

      expect(result.processed).toBe(1);
      expect(result.approved).toBe(1);
      expect(prisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'wf-overdue' },
        data: { status: 'APPROVED', comment: 'Auto-approved (timeout)' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        'workflow.timeout.auto_approve',
        'system',
        'Workflow',
        'wf-overdue',
        expect.any(Object),
      );
      expect(notification.broadcastToTeam).toHaveBeenCalledWith('team-1', expect.any(Object));
    });

    it('auto-rejects workflows past their deadline (REJECT action)', async () => {
      const rejectWf = { ...overdue, id: 'wf-reject', timeoutAction: 'REJECT' };
      prisma.workflow.findMany.mockResolvedValue([rejectWf]);
      prisma.workflow.update.mockResolvedValue({ ...rejectWf, status: 'REJECTED' });
      prisma.content.findUnique.mockResolvedValue({ teamId: 'team-1' });

      const result = await service.processTimeouts(baseTime);

      expect(result.processed).toBe(1);
      expect(result.rejected).toBe(1);
      expect(prisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'wf-reject' },
        data: { status: 'REJECTED', comment: 'Auto-rejected (timeout)' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        'workflow.timeout.auto_reject',
        'system',
        'Workflow',
        'wf-reject',
        expect.any(Object),
      );
    });

    it('auto-escalates by reassigning the workflow (ESCALATE action)', async () => {
      const escalateWf = { ...overdue, id: 'wf-escalate', timeoutAction: 'ESCALATE', escalateTo: 'u-2' };
      prisma.workflow.findMany.mockResolvedValue([escalateWf]);
      prisma.user.findUnique.mockResolvedValue({ id: 'u-2' });
      prisma.workflow.update.mockResolvedValue(escalateWf);
      prisma.content.findUnique.mockResolvedValue({ teamId: 'team-1' });

      const result = await service.processTimeouts(baseTime);

      expect(result.processed).toBe(1);
      expect(result.escalated).toBe(1);
      expect(prisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'wf-escalate' },
        data: { approverId: 'u-2' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        'workflow.timeout.escalate',
        'system',
        'Workflow',
        'wf-escalate',
        expect.objectContaining({ escalateTo: 'u-2' }),
      );
    });

    it('skips workflows that have not yet exceeded the timeout window', async () => {
      prisma.workflow.findMany.mockResolvedValue([notYet]);

      const result = await service.processTimeouts(baseTime);

      expect(result.processed).toBe(0);
      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('skips workflows without a configured timeout action', async () => {
      const noAction = { ...overdue, timeoutAction: null };
      prisma.workflow.findMany.mockResolvedValue([noAction]);

      const result = await service.processTimeouts(baseTime);

      expect(result.processed).toBe(0);
    });

    it('records errors and continues processing', async () => {
      const wf1 = { ...overdue, id: 'wf-fail', timeoutAction: 'ESCALATE', escalateTo: null };
      prisma.workflow.findMany.mockResolvedValue([wf1]);

      const result = await service.processTimeouts(baseTime);

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].workflowId).toBe('wf-fail');
    });
  });

  // ── sendReminders ──────────────────────────────────────────────

  describe('sendReminders', () => {
    const baseTime = new Date('2026-07-18T12:00:00Z');
    // Created 30h ago with 48h timeout → 18h left, within 24h window
    const approaching = {
      id: 'wf-remind',
      contentId: 'c-1',
      approverId: 'u-1',
      status: 'PENDING',
      timeoutHours: 48,
      timeoutAction: 'APPROVE',
      escalateTo: null,
      firstReminderAt: null,
      createdAt: new Date(baseTime.getTime() - 30 * 60 * 60 * 1000),
    };
    // Created 10h ago with 48h timeout → 38h left, outside 24h window
    const farAway = {
      ...approaching,
      id: 'wf-far',
      createdAt: new Date(baseTime.getTime() - 10 * 60 * 60 * 1000),
    };

    it('sends reminder to approver when within window and marks firstReminderAt', async () => {
      prisma.workflow.findMany.mockResolvedValue([approaching]);

      const result = await service.sendReminders(24, baseTime);

      expect(result.sent).toBe(1);
      expect(notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-1',
          type: 'warning',
          title: 'Approval timeout approaching',
        }),
      );
      expect(prisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'wf-remind' },
        data: { firstReminderAt: baseTime },
      });
    });

    it('skips reminders for workflows outside the window', async () => {
      prisma.workflow.findMany.mockResolvedValue([farAway]);

      const result = await service.sendReminders(24, baseTime);

      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(0); // filtered out by loop, not counted as skipped
      expect(notification.create).not.toHaveBeenCalled();
    });

    it('does not send a second reminder if one was already sent', async () => {
      const alreadyReminded = { ...approaching, firstReminderAt: new Date('2026-07-17T00:00:00Z') };
      prisma.workflow.findMany.mockResolvedValue([]); // Prisma filters firstReminderAt: null

      const result = await service.sendReminders(24, baseTime);

      expect(result.sent).toBe(0);
    });
  });

  // ── getTimeoutSummary ──────────────────────────────────────────

  describe('getTimeoutSummary', () => {
    const baseTime = new Date('2026-07-18T12:00:00Z');

    it('categorizes workflows into overdue / approaching / ok', async () => {
      prisma.workflow.findMany.mockResolvedValue([
        {
          id: 'wf-1',
          contentId: 'c-1',
          approverId: 'u-1',
          status: 'PENDING',
          timeoutHours: 48,
          timeoutAction: 'APPROVE',
          escalateTo: null,
          firstReminderAt: null,
          createdAt: new Date(baseTime.getTime() - 50 * 60 * 60 * 1000), // overdue
        },
        {
          id: 'wf-2',
          contentId: 'c-2',
          approverId: 'u-1',
          status: 'PENDING',
          timeoutHours: 48,
          timeoutAction: 'REJECT',
          escalateTo: null,
          firstReminderAt: null,
          createdAt: new Date(baseTime.getTime() - 30 * 60 * 60 * 1000), // approaching (18h left)
        },
        {
          id: 'wf-3',
          contentId: 'c-3',
          approverId: 'u-1',
          status: 'PENDING',
          timeoutHours: 48,
          timeoutAction: 'ESCALATE',
          escalateTo: 'u-2',
          firstReminderAt: null,
          createdAt: new Date(baseTime.getTime() - 5 * 60 * 60 * 1000), // ok (43h left)
        },
      ]);

      const summary = await service.getTimeoutSummary(24, baseTime);

      expect(summary.overdue).toHaveLength(1);
      expect(summary.overdue[0].id).toBe('wf-1');
      expect(summary.approaching).toHaveLength(1);
      expect(summary.approaching[0].id).toBe('wf-2');
      expect(summary.ok).toHaveLength(1);
      expect(summary.ok[0].id).toBe('wf-3');
      expect(summary.total).toBe(3);
    });
  });
});
