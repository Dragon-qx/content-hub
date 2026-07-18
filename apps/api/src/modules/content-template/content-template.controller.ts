import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ContentTemplateService } from './content-template.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CreateContentTemplateDto,
  UpdateContentTemplateDto,
  ListTemplatesQueryDto,
  ApplyTemplateDto,
} from './dto/content-template.dto';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class ContentTemplateController {
  constructor(
    private readonly templates: ContentTemplateService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateContentTemplateDto,
    @Req() req: { ip?: string },
  ) {
    const created = await this.templates.create(
      {
        title: dto.title,
        body: dto.body,
        contentType: dto.contentType,
        teamId: dto.teamId ?? '',
        tags: dto.tags,
      },
      user.userId,
    );
    await this.audit.log(
      'CREATE',
      user.userId,
      'ContentTemplate',
      created.id,
      { title: dto.title, contentType: dto.contentType },
      req.ip,
    );
    return created;
  }

  @Get()
  findAll(@Query() query: ListTemplatesQueryDto) {
    return this.templates.findAll({
      skip: query.skip,
      take: query.take,
      teamId: query.teamId,
      search: query.search,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templates.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateContentTemplateDto,
    @Req() req: { ip?: string },
  ) {
    const updated = await this.templates.update(id, dto);
    await this.audit.log(
      'UPDATE',
      user.userId,
      'ContentTemplate',
      id,
      { changed: dto },
      req.ip,
    );
    return updated;
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    const result = await this.templates.remove(id);
    await this.audit.log(
      'DELETE',
      user.userId,
      'ContentTemplate',
      id,
      null,
      req.ip as string | undefined,
    );
    return result;
  }

  /**
   * Apply a template to seed a new draft. Returns the input shape for
   * `ContentService.create`; the frontend persists it as DRAFT content or loads
   * it into the editor.
   */
  @Post(':id/apply')
  async apply(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ApplyTemplateDto,
    @Req() req: { ip?: string },
  ) {
    const seed = await this.templates.apply(id, {
      templateId: id,
      teamId: dto.teamId,
      title: dto.title,
    });
    // Best-effort audit; the seed itself is not persisted here.
    await this.audit.log(
      'APPLY',
      user.userId,
      'ContentTemplate',
      id,
      { teamId: dto.teamId },
      req.ip,
    );
    return seed;
  }
}
