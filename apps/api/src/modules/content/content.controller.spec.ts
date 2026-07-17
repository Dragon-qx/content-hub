import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('ContentController', () => {
  let controller: ContentController;
  let service: any;

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'c1', version: 1 }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      remove: jest.fn().mockResolvedValue({ success: true, id: 'c1' }),
    };

    const module = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [
        { provide: ContentService, useValue: service },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ContentController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', ContentController);
    expect(guards).toBeDefined();
    expect(guards).toContain(JwtAuthGuard);
  });

  it('create delegates to service with user id from request', async () => {
    const req: any = { user: { userId: 'u1' } };
    await controller.create(req.user, {
      title: 'T',
      body: 'B',
      teamId: 'team-1',
    });
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'T', teamId: 'team-1' }),
      'u1',
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

  it('update passes user id from request', async () => {
    const req: any = { user: { userId: 'u1' } };
    await controller.update('c1', req.user, { title: 'New' });
    expect(service.update).toHaveBeenCalledWith('c1', { title: 'New' }, 'u1');
  });
});
