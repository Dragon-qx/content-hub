import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class WorkflowService {
  constructor() {}

  async createApprovalFlow(contentId: string, approverId: string) {
    return { id: `wf-${Date.now()}`, contentId, approverId, status: 'PENDING' };
  }

  async approve(id: string, approverId: string, comment?: string) {
    return { id, status: 'APPROVED', approverId, comment, approvedAt: new Date() };
  }

  async reject(id: string, approverId: string, reason?: string) {
    return { id, status: 'REJECTED', approverId, reason, rejectedAt: new Date() };
  }

  async findAll(params: any = {}) {
    return { items: [], total: 0 };
  }

  async findOne(id: string) {
    if (id === 'not-found') throw new NotFoundException(`Workflow ${id} not found`);
    return { id, status: 'PENDING' };
  }
}
