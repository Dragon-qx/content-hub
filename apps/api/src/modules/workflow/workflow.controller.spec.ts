import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('WorkflowController', () => {
  let controller: WorkflowController;
  let service: any;

  beforeEach(async () => {
    service = {
      createApprovalFlow: jest.fn().mockResolvedValue({ id: 'wf-1', status: 'PENDING' }),
      approve: jest.fn().mockResolvedValue({ id: 'wf-1', status: 'APPROVED' }),
      reject: jest.fn().mockResolvedValue({ id: 'wf-1', status: 'REJECTED' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: 'wf-1' }),
    };

    const module = await Test.createTestingModule({
      controllers: [WorkflowController],
      providers: [{ provide: WorkflowService, useValue: service }],
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
});
