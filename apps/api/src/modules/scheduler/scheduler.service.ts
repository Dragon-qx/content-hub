import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SchedulerService {
  constructor(private readonly prisma: PrismaService) {}

  async schedule(
    contentId: string,
    platform: string,
    scheduledAt: Date = new Date(),
  ) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
    });
    if (!content) throw new NotFoundException(`Content ${contentId} not found`);

    return this.prisma.publishJob.create({
      data: {
        contentId,
        status: JobStatus.QUEUED,
        scheduledAt,
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

  async findAll(params: any = {}) {
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.contentId) where.contentId = params.contentId;

    const [items, total] = await Promise.all([
      this.prisma.publishJob.findMany({
        where,
        skip: params.skip,
        take: params.take ?? 20,
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.publishJob.count({ where }),
    ]);

    return { items, total, skip: params.skip ?? 0, take: params.take ?? 20 };
  }

  async findOne(id: string) {
    const job = await this.prisma.publishJob.findUnique({
      where: { id },
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

  async markRunning(jobId: string) {
    return this.prisma.publishJob.update({
      where: { id: jobId },
      data: { status: JobStatus.RUNNING, startedAt: new Date() },
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

  async getDueJobs(limit = 10) {
    return this.prisma.publishJob.findMany({
      where: {
        status: JobStatus.QUEUED,
        scheduledAt: { lte: new Date() },
      },
      take: limit,
      orderBy: { scheduledAt: 'asc' },
    });
  }
}
