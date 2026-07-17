import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';
import { JobStatus, Platform, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PlatformSdkService,
  PublishOutcome,
} from '../platform-sdk/platform-sdk.service';

/** Max retries before a job is considered permanently failed. */
export const MAX_RETRY = 3;

/** Query params for listing publish jobs. */
export interface ListJobParams {
  skip?: number;
  take?: number;
  status?: JobStatus;
  contentId?: string;
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(PlatformSdkService)
    private readonly platformSdk: PlatformSdkService | null,
  ) {}

  /**
   * Queue a publish job for a piece of content. Resolves the target social
   * account from the content's team + platform and records both on the job so
   * the worker can execute it later without re-resolving.
   */
  async schedule(
    contentId: string,
    platform: Platform | string,
    scheduledAt: Date = new Date(),
  ) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });
    if (!content) {
      throw new NotFoundException(`Content ${contentId} not found`);
    }

    const account = await this.prisma.socialAccount.findFirst({
      where: { teamId: content.teamId, platform: platform as Platform },
    });

    return this.prisma.publishJob.create({
      data: {
        contentId,
        platform: platform as Platform,
        accountId: account?.id ?? null,
        status: JobStatus.QUEUED,
        scheduledAt,
      },
    });
  }

  /**
   * Execute a queued job: mark RUNNING, publish via the platform SDK, then
   * mark COMPLETED (linking the resulting PlatformPost) or FAILED with retry.
   */
  async executeJob(jobId: string): Promise<void> {
    const job = await this.prisma.publishJob.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (job.status === JobStatus.COMPLETED) return;
    if (!this.platformSdk) {
      throw new Error('PlatformSdkService is not available');
    }

    // Conditional mark: only one worker may claim a QUEUED/RETRYING job. If
    // another worker already moved it to RUNNING/COMPLETED, this update matches
    // zero rows and we bail out instead of double-publishing.
    const claimed = await this.markRunning(jobId);
    if (!claimed) return;

    let outcome: PublishOutcome;
    try {
      outcome = await this.platformSdk.publish(
        job.contentId,
        job.platform,
        {},
        job.accountId ?? undefined,
      );
    } catch (err) {
      await this.handleFailure(job, err);
      return;
    }

    await this.prisma.publishJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: outcome.publishedAt ?? new Date(),
        post: outcome.postId ? { connect: { id: outcome.postId } } : undefined,
      },
    });
  }

  /**
   * Atomically claim a job for execution by moving it QUEUED/RETRYING → RUNNING.
   * Returns true if this call claimed the job, false if it was already claimed
   * or completed (status had changed), so the caller can skip double execution.
   */
  async markRunning(jobId: string): Promise<boolean> {
    const res = await this.prisma.publishJob.updateMany({
      where: {
        id: jobId,
        status: { in: [JobStatus.QUEUED, JobStatus.RETRYING] },
      },
      data: { status: JobStatus.RUNNING, startedAt: new Date() },
    });
    return res.count > 0;
  }

  /**
   * Handle a publish failure: record the error, bump the retry count and
   * either reschedule (RETRYING) or give up (FAILED) based on MAX_RETRY.
   */
  private async handleFailure(
    job: { id: string; retryCount: number },
    err: unknown,
  ) {
    const message =
      err instanceof Error ? err.message : String(err ?? 'unknown error');
    this.logger.warn(`Publish job ${job.id} failed: ${message}`);

    const nextRetry = job.retryCount + 1;
    const permanent = nextRetry >= MAX_RETRY;

    await this.prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: permanent ? JobStatus.FAILED : JobStatus.RETRYING,
        retryCount: nextRetry,
        error: message,
      },
    });
  }

  async cancel(jobId: string) {
    const job = await this.prisma.publishJob.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    return this.prisma.publishJob.update({
      where: { id: jobId },
      data: { status: JobStatus.CANCELLED },
    });
  }

  async findAll(params: ListJobParams = {}) {
    const where: Prisma.PublishJobWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.contentId) where.contentId = params.contentId;

    const [items, total] = await Promise.all([
      this.prisma.publishJob.findMany({
        where,
        skip: params.skip,
        take: params.take ?? 20,
        orderBy: { scheduledAt: 'asc' },
        include: { post: true, account: true },
      }),
      this.prisma.publishJob.count({ where }),
    ]);

    return { items, total, skip: params.skip ?? 0, take: params.take ?? 20 };
  }

  async findOne(id: string) {
    const job = await this.prisma.publishJob.findUnique({
      where: { id },
      include: { post: true, account: true },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async retry(jobId: string) {
    const job = await this.prisma.publishJob.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    return this.prisma.publishJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.QUEUED,
        retryCount: { increment: 1 },
        error: null,
      },
    });
  }

  async markCompleted(jobId: string) {
    return this.prisma.publishJob.update({
      where: { id: jobId },
      data: { status: JobStatus.COMPLETED, completedAt: new Date() },
    });
  }

  async markFailed(jobId: string, error: string) {
    return this.prisma.publishJob.update({
      where: { id: jobId },
      data: { status: JobStatus.FAILED, error },
    });
  }

  /**
   * Jobs due for execution: QUEUED (or RETRYING) with scheduledAt <= now,
   * bounded by `limit`. Ordered soonest-first.
   */
  async getDueJobs(now: Date = new Date(), limit = 10) {
    return this.prisma.publishJob.findMany({
      where: {
        status: { in: [JobStatus.QUEUED, JobStatus.RETRYING] },
        scheduledAt: { lte: now },
      },
      take: limit,
      orderBy: { scheduledAt: 'asc' },
    });
  }
}
