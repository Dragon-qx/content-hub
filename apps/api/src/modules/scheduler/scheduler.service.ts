import { Injectable, NotFoundException } from '@nestjs/common';

export enum PublishJobStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Injectable()
export class SchedulerService {
  constructor() {}

  async schedule(contentId: string, platform: string, scheduledAt: Date) {
    return {
      id: `job-${Date.now()}`,
      contentId,
      platform,
      status: PublishJobStatus.QUEUED,
      scheduledAt,
      createdAt: new Date(),
    };
  }

  async cancel(jobId: string) {
    return { id: jobId, status: PublishJobStatus.CANCELLED };
  }

  async findAll(params: any = {}) {
    return { items: [], total: 0 };
  }

  async findOne(id: string) {
    if (id === 'not-found') throw new NotFoundException(`Job ${id} not found`);
    return { id, status: PublishJobStatus.QUEUED };
  }

  async retry(jobId: string) {
    return { id: jobId, status: PublishJobStatus.QUEUED, retried: true };
  }
}
