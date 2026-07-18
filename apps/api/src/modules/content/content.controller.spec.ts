import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('ContentController', () => {
  let controller: ContentController;
  let service: any;

  let audit: any;

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'c1', version: 1 }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      calendar: jest
        .fn()
        .mockResolvedValue({ year: 2026, month: 7, days: [{ date: '2026-07-01', events: [] }] }),
      findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      rollbackVersion: jest.fn().mockResolvedValue({ id: 'c1' }),
      remove: jest.fn().mockResolvedValue({ success: true, id: 'c1' }),
    };
    audit = { log: jest.fn().mockResolvedValue({ id: 'log-1' }) };

    const moduleRef = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [
        { provide: ContentService, useValue: service },
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: audit },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(ContentController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', ContentController);
    expect(guards).toBeDefined();
    expect(guards).toContain(JwtAuthGuard);
  });

  it('create delegates to service with user id from request', async () => {
    const user: any = { userId: 'u1' };
    const req: any = { ip: '127.0.0.1' };
    await controller.create(user, { title: 'T', body: 'B', teamId: 'team-1' }, req);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'T', teamId: 'team-1' }),
      'u1',
    );
  });

  it('create writes an audit log with the new resource id and request ip', async () => {
    const user: any = { userId: 'u1' };
    const req: any = { ip: '127.0.0.1' };
    await controller.create(user, { title: 'T', teamId: 'team-1' }, req);
    expect(audit.log).toHaveBeenCalledWith(
      'CREATE',
      'u1',
      'Content',
      'c1',
      expect.objectContaining({ title: 'T' }),
      '127.0.0.1',
    );
  });

  it('findAll forwards normalized query params', async () => {
    await controller.findAll({
      skip: 0,
      take: 10,
      status: undefined,
      teamId: 'team-1',
      search: undefined,
    } as any);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10, teamId: 'team-1' }),
    );
  });

  it('calendar forwards year/month to the service', async () => {
    const result = await controller.calendar({ year: 2026, month: 7 } as any);
    expect(service.calendar).toHaveBeenCalledWith(2026, 7);
    expect(result).toMatchObject({ year: 2026, month: 7 });
  });

  it('update passes user id from request', async () => {
    const user: any = { userId: 'u1' };
    await controller.update('c1', user, { title: 'New' }, { ip: '127.0.0.1' });
    expect(service.update).toHaveBeenCalledWith('c1', { title: 'New' }, 'u1');
  });

  it('rollback delegates to service with the target version and audit', async () => {
    const user: any = { userId: 'u1' };
    const req: any = { ip: '127.0.0.1' };
    await controller.rollback('c1', user, { version: 2 }, req);
    expect(service.rollbackVersion).toHaveBeenCalledWith('c1', 2, 'u1', undefined);
    expect(audit.log).toHaveBeenCalledWith(
      'ROLLBACK',
      'u1',
      'Content',
      'c1',
      { toVersion: 2, changeNote: undefined },
      '127.0.0.1',
    );
  });

  it('rollback forwards a custom changeNote to the service', async () => {
    const user: any = { userId: 'u1' };
    await controller.rollback('c1', user, { version: 3, changeNote: 'Revert' }, { ip: '::' });
    expect(service.rollbackVersion).toHaveBeenCalledWith('c1', 3, 'u1', 'Revert');
  });
});
