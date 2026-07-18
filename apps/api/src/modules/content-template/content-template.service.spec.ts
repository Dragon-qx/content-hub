import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ContentType } from '@prisma/client';
import { ContentTemplateService } from './content-template.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mockPrisma } from '../../../test/prisma.mock';

describe('ContentTemplateService', () => {
  let service: ContentTemplateService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ContentTemplateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ContentTemplateService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a template scoped to a team with defaults', async () => {
      prisma.contentTemplate.create.mockResolvedValue({
        id: 't1',
        title: 'Launch post',
        body: 'Hello',
        contentType: ContentType.TEXT,
        teamId: 'team-1',
        tags: ['launch'],
        createdBy: 'user-1',
      });

      const result = await service.create(
        { title: 'Launch post', body: 'Hello', teamId: 'team-1', tags: ['launch'] },
        'user-1',
      );

      expect(result.id).toBe('t1');
      expect(prisma.contentTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Launch post',
            teamId: 'team-1',
            createdBy: 'user-1',
            tags: ['launch'],
          }),
        }),
      );
    });

    it('defaults contentType to TEXT and tags to [] when omitted', async () => {
      prisma.contentTemplate.create.mockResolvedValue({ id: 't2' });
      await service.create({ title: 'Minimal', teamId: 'team-1' }, 'user-1');

      expect(prisma.contentTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentType: ContentType.TEXT,
            tags: [],
          }),
        }),
      );
    });

    it('rejects create without teamId', async () => {
      await expect(
        service.create({ title: 'No team', teamId: '' }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('returns paginated templates for a team', async () => {
      prisma.contentTemplate.findMany.mockResolvedValue([
        { id: 't1' },
        { id: 't2' },
      ] as any);
      prisma.contentTemplate.count.mockResolvedValue(2);

      const result = await service.findAll({ teamId: 'team-1', skip: 0, take: 20 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(prisma.contentTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: 'team-1' },
          skip: 0,
          take: 20,
          orderBy: { updatedAt: 'desc' },
        }),
      );
    });

    it('builds a free-text OR search across title and body', async () => {
      prisma.contentTemplate.findMany.mockResolvedValue([]);
      prisma.contentTemplate.count.mockResolvedValue(0);

      await service.findAll({ search: 'launch' });

      expect(prisma.contentTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { title: { contains: 'launch', mode: 'insensitive' } },
              { body: { contains: 'launch', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a template by id', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue({ id: 't1' } as any);
      const result = await service.findOne('t1');
      expect(result.id).toBe('t1');
    });

    it('throws NotFoundException when missing', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('patches only provided fields', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue({ id: 't1' } as any);
      prisma.contentTemplate.update.mockResolvedValue({ id: 't1', title: 'New' } as any);

      const result = await service.update('t1', { title: 'New' });

      expect(result.title).toBe('New');
      expect(prisma.contentTemplate.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { title: 'New' },
      });
    });
  });

  describe('remove', () => {
    it('deletes the template', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue({ id: 't1' } as any);
      prisma.contentTemplate.delete.mockResolvedValue({ id: 't1' } as any);

      const result = await service.remove('t1');

      expect(result).toEqual({ success: true, id: 't1' });
      expect(prisma.contentTemplate.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('throws NotFoundException when deleting a missing template', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('apply', () => {
    const template = {
      id: 't1',
      title: 'Launch post',
      body: 'Today we launch…',
      contentType: ContentType.TEXT,
      teamId: 'team-1',
      tags: ['launch'],
      variables: [],
    };

    it('seeds a draft from the template', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue(template as any);

      const seed = await service.apply('t1', { templateId: 't1', teamId: 'team-1' });

      expect(seed).toEqual({
        title: 'Launch post',
        body: 'Today we launch…',
        contentType: ContentType.TEXT,
        teamId: 'team-1',
        tags: ['launch'],
      });
    });

    it('honours a custom title override', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue(template as any);

      const seed = await service.apply('t1', {
        templateId: 't1',
        teamId: 'team-1',
        title: 'Custom title',
      });

      expect(seed.title).toBe('Custom title');
    });

    it('rejects applying a template from another team', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue(template as any);

      await expect(
        service.apply('t1', { templateId: 't1', teamId: 'other-team' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('substitutes variable placeholders when values are provided', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue({
        ...template,
        title: 'Introducing {{productName}}',
        body: 'Today we launch {{productName}} — {{tagline}}',
        variables: [
          { key: 'productName', label: 'Product Name', type: 'text' },
          { key: 'tagline', label: 'Tagline', type: 'text', defaultValue: 'the best' },
        ],
      } as any);

      const seed = await service.apply('t1', {
        templateId: 't1',
        teamId: 'team-1',
        values: { productName: 'ContentHub' },
      });

      expect(seed.title).toBe('Introducing ContentHub');
      expect(seed.body).toBe('Today we launch ContentHub — the best');
    });
  });

  describe('resolveVariables', () => {
    it('replaces all occurrences of a placeholder', () => {
      const body = '{{greeting}} world, {{greeting}}!';
      const vars = [{ key: 'greeting', label: 'Greeting', type: 'text' as const }];
      expect(service.resolveVariables(body, vars, { greeting: 'hello' })).toBe('hello world, hello!');
    });

    it('falls back to defaultValue when value not provided', () => {
      const body = 'Hello {{name}}';
      const vars = [{ key: 'name', label: 'Name', type: 'text' as const, defaultValue: 'World' }];
      expect(service.resolveVariables(body, vars, {})).toBe('Hello World');
    });

    it('leaves placeholder unchanged when no value or default', () => {
      const body = 'Hello {{name}}';
      const vars = [{ key: 'name', label: 'Name', type: 'text' as const }];
      expect(service.resolveVariables(body, vars, {})).toBe('Hello {{name}}');
    });

    it('handles empty variables array', () => {
      expect(service.resolveVariables('no change', [], {})).toBe('no change');
    });

    it('does not touch text outside placeholders', () => {
      const body = 'plain text';
      const vars = [{ key: 'unused', label: 'Unused', type: 'text' as const }];
      expect(service.resolveVariables(body, vars, { unused: 'replaced' })).toBe('plain text');
    });
  });

  describe('resolve', () => {
    it('resolves both title and body', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue({
        id: 't1',
        title: 'New: {{product}}',
        body: 'Meet {{product}} by {{brand}}',
        variables: [
          { key: 'product', label: 'Product', type: 'text' },
          { key: 'brand', label: 'Brand', type: 'text', defaultValue: 'us' },
        ],
      } as any);

      const result = await service.resolve('t1', { product: 'ContentHub' });
      expect(result.title).toBe('New: ContentHub');
      expect(result.body).toBe('Meet ContentHub by us');
    });

    it('throws NotFoundException for missing template', async () => {
      prisma.contentTemplate.findUnique.mockResolvedValue(null);
      await expect(service.resolve('nope', {})).rejects.toThrow(NotFoundException);
    });
  });
});
