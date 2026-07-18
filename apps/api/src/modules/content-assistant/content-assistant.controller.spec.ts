import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ContentAssistantController } from './content-assistant.controller';
import { ContentAssistantService } from './content-assistant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('ContentAssistantController', () => {
  let controller: ContentAssistantController;
  let service: any;

  beforeEach(async () => {
    service = {
      optimizeTitles: jest.fn().mockResolvedValue({ variants: [] }),
      extractTags: jest.fn().mockResolvedValue({ tags: [] }),
      audit: jest.fn().mockResolvedValue({ score: 100, findings: [], platforms: [] }),
      generateVariants: jest.fn().mockResolvedValue({ variants: [] }),
    };

    const module = await Test.createTestingModule({
      controllers: [ContentAssistantController],
      providers: [{ provide: ContentAssistantService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ContentAssistantController);
    jest.clearAllMocks();
  });

  it('requires JwtAuthGuard', () => {
    const reflector = new Reflector();
    const guards = reflector.get('__guards__', ContentAssistantController);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('optimizeTitles forwards the dto to the service', async () => {
    const dto = { body: 'title dto', count: 3 };
    await controller.optimizeTitles(dto);
    expect(service.optimizeTitles).toHaveBeenCalledWith(dto);
  });

  it('extractTags forwards the dto to the service', async () => {
    const dto = { body: 'tag dto', count: 5 };
    await controller.extractTags(dto);
    expect(service.extractTags).toHaveBeenCalledWith(dto);
  });

  it('audit forwards the dto to the service', async () => {
    const dto = { body: 'audit dto' };
    await controller.audit(dto);
    expect(service.audit).toHaveBeenCalledWith(dto);
  });

  it('generateVariants forwards the dto to the service', async () => {
    const dto = { body: 'variant dto', style: 'all' as const };
    await controller.generateVariants(dto);
    expect(service.generateVariants).toHaveBeenCalledWith(dto);
  });
});
