import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('AuditController', () => {
  let controller: AuditController;
  let service: any;

  beforeEach(async () => {
    service = {
      log: jest.fn().mockResolvedValue({ id: 'log-1' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findByResource: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuditController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', AuditController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('log delegates to the service with body fields and request ip', async () => {
    const req = { ip: '1.2.3.4' };
    await controller.log(
      {
        action: 'CREATE',
        userId: 'u1',
        resourceType: 'Content',
        resourceId: 'c1',
        details: {},
      } as any,
      req,
    );
    expect(service.log).toHaveBeenCalledWith(
      'CREATE',
      'u1',
      'Content',
      'c1',
      {},
      '1.2.3.4',
    );
  });

  it('findAll forwards normalized query params', async () => {
    await controller.findAll({
      skip: 0,
      take: 20,
      userId: 'u1',
      action: 'CREATE',
      resourceType: 'Content',
      resourceId: 'c1',
    } as any);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        action: 'CREATE',
        entityType: 'Content',
        entityId: 'c1',
      }),
    );
  });
});
