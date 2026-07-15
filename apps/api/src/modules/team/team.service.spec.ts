import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { TeamService } from './team.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('TeamService', () => {
  let service: TeamService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      team: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      member: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TeamService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a team with owner as admin member', async () => {
      const dto = { name: 'Test Team' };
      prisma.team.create.mockResolvedValue({ id: 'team-1', ...dto, ownerId: 'user-1' });

      const result = await service.create('user-1', dto);

      expect(result).toHaveProperty('id', 'team-1');
      expect(prisma.team.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          name: 'Test Team',
          ownerId: 'user-1',
          members: {
            create: { userId: 'user-1', role: 'ADMIN' },
          },
        }),
      }));
    });
  });

  describe('findAllForUser', () => {
    it('should return teams for a user', async () => {
      prisma.member.findMany.mockResolvedValue([
        { team: { id: 'team-1' } },
        { team: { id: 'team-2' } },
      ]);

      const result = await service.findAllForUser('user-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException for missing team', async () => {
      prisma.team.findUnique.mockResolvedValue(null);
      await expect(service.findById('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should allow owner to update', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'user-1' });
      prisma.team.update.mockResolvedValue({ id: 'team-1', name: 'Updated' });

      const result = await service.update('team-1', 'user-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should reject non-owner', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'other-user' });
      await expect(service.update('team-1', 'user-1', { name: 'X' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should allow owner to delete', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'user-1' });
      prisma.team.delete.mockResolvedValue({ id: 'team-1' });

      const result = await service.remove('team-1', 'user-1');
      expect(result).toHaveProperty('deleted', true);
    });
  });

  describe('addMember', () => {
    it('should allow owner to add member', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'user-1' });
      prisma.member.findUnique.mockResolvedValue(null);
      prisma.member.create.mockResolvedValue({ id: 'mem-1', role: 'EDITOR' });

      const result = await service.addMember('team-1', 'user-1', { userId: 'user-2', role: 'EDITOR' });
      expect(result).toHaveProperty('role', 'EDITOR');
    });

    it('should reject duplicate member', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'user-1' });
      prisma.member.findUnique.mockResolvedValue({ id: 'mem-1' });

      await expect(service.addMember('team-1', 'user-1', { userId: 'user-2', role: 'EDITOR' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject invalid role', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'user-1' });
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(service.addMember('team-1', 'user-1', { userId: 'user-2', role: 'INVALID' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('removeMember', () => {
    it('should allow owner to remove member', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'user-1' });
      prisma.member.delete.mockResolvedValue({ id: 'mem-1' });

      const result = await service.removeMember('team-1', 'user-1', 'mem-1');
      expect(result).toHaveProperty('deleted', true);
    });

    it('should reject owner removing themselves', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'user-1' });

      await expect(service.removeMember('team-1', 'user-1', 'user-1'))
        .rejects.toThrow(BadRequestException);
    });
  });
});
