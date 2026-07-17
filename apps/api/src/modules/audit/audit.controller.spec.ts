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

  it('findAll forwards date range and operator search', async () => {
    await controller.findAll({
      from: '2026-01-01',
      to: '2026-02-01',
      operator: '小林',
    } as any);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-01-01',
        to: '2026-02-01',
        operator: '小林',
      }),
    );
  });

  it('export streams a CSV with a header and one row per log', async () => {
    const res: any = { send: jest.fn() };
    const log = {
      id: 'log-1',
      userId: 'u1',
      user: { id: 'u1', name: '林', email: 'lin@x.com' },
      action: 'CREATE',
      entityType: 'Content',
      entityId: 'c1',
      ipAddress: '127.0.0.1',
      metadata: { title: 'T' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    service.exportAll = jest.fn().mockResolvedValue([log]);

    await controller.export({ action: 'CREATE' } as any, res);

    expect(service.exportAll).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE' }),
    );
    const out = res.send.mock.calls[0][0];
    const lines = out.split('\n');
    expect(lines[0]).toContain('operatorName');
    expect(lines[1]).toContain('林');
    expect(lines[1]).toContain('CREATE');
  });
});
