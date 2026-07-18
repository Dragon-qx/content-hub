import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowTimeoutService } from './workflow-timeout.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('WorkflowController', () => {
  let controller: WorkflowController;
  let service: any;
  let timeoutService: any;

  beforeEach(async () => {
    service = {
      createApprovalFlow: jest.fn().mockResolvedValue({ id: 'wf-1', status: 'PENDING' }),
      approve: jest.fn().mockResolvedValue({ id: 'wf-1', status: 'APPROVED' }),
      reject: jest.fn().mockResolvedValue({ id: 'wf-1', status: 'REJECTED' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: 'wf-1' }),
    };
    timeoutService = {
      setConfig: jest.fn().mockResolvedValue({ id: 'wf-1', timeoutHours: 72 }),
      getTimeoutSummary: jest.fn().mockResolvedValue({ overdue: [], approaching: [], ok: [], total: 0 }),
    };

    const module = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [
        { provide: WorkflowService, useValue: service },
        { provide: WorkflowTimeoutService, useValue: timeoutService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(WorkflowController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', WorkflowController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('createApprovalFlow delegates contentId, approverId and summary', async () => {
    await controller.createApproval({
      contentId: 'c1',
      approverId: 'u1',
      summary: 'please review',
    } as any);
    expect(service.createApprovalFlow).toHaveBeenCalledWith(
      'c1',
      'u1',
      'please review',
    );
  });

  it('approve delegates id, approverId and comment', async () => {
    await controller.approve('wf-1', { approverId: 'u1', comment: 'ok' } as any);
    expect(service.approve).toHaveBeenCalledWith('wf-1', 'u1', 'ok');
  });

  it('reject delegates id, approverId and comment', async () => {
    await controller.reject('wf-1', { approverId: 'u1', comment: 'no' } as any);
    expect(service.reject).toHaveBeenCalledWith('wf-1', 'u1', 'no');
  });

  it('setTimeoutConfig delegates workflow id + DTO to WorkflowTimeoutService', async () => {
    await controller.setTimeoutConfig('wf-1', { timeoutHours: 72, timeoutAction: 'APPROVE' } as any);
    expect(timeoutService.setConfig).toHaveBeenCalledWith('wf-1', { timeoutHours: 72, timeoutAction: 'APPROVE' });
  });

  it('timeoutSummary delegates windowHours query', async () => {
    await controller.timeoutSummary({ windowHours: 12 } as any);
    expect(timeoutService.getTimeoutSummary).toHaveBeenCalledWith(12);
  });
});
