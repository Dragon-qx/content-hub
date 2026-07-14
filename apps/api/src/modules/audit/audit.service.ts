import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
  constructor() {}

  async log(action: string, userId: string, resourceType: string, resourceId: string, details?: any) {
    return {
      id: `audit-${Date.now()}`,
      action,
      userId,
      resourceType,
      resourceId,
      details,
      createdAt: new Date(),
    };
  }

  async findAll(params: any = {}) {
    return { items: [], total: 0 };
  }

  async findByResource(resourceType: string, resourceId: string) {
    return { resourceType, resourceId, logs: [] };
  }
}
