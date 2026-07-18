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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  ContentTemplateService,
  TemplateVariable,
  CreateTemplateInput,
  UpdateTemplateInput,
} from './content-template.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CreateContentTemplateDto,
  UpdateContentTemplateDto,
  ListTemplatesQueryDto,
  ApplyTemplateDto,
  ResolveTemplateDto,
} from './dto/content-template.dto';

@ApiTags('Content Templates')
@ApiBearerAuth()
@Controller('templates')
@UseGuards(JwtAuthGuard)
export class ContentTemplateController {
  constructor(
    private readonly templates: ContentTemplateService,
    private readonly audit: AuditService,
  ) {}

  @ApiOperation({ summary: 'Create template', description: 'Creates a reusable, team-scoped content template.' })
  @ApiCreatedResponse({ description: 'Template created.' })
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
        variables: dto.variables as unknown as TemplateVariable[],
      } as CreateTemplateInput,
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

  @ApiOperation({ summary: 'List templates', description: 'Paginated, searchable listing of the team\'s templates.' })
  @Get()
  findAll(@Query() query: ListTemplatesQueryDto) {
    return this.templates.findAll({
      skip: query.skip,
      take: query.take,
      teamId: query.teamId,
      search: query.search,
    });
  }

  @ApiOperation({ summary: 'Get template by id' })
  @ApiParam({ name: 'id', description: 'Template id' })
  @ApiOkResponse({ description: 'Template detail.' })
  @ApiNotFoundResponse({ description: 'Template not found.' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templates.findOne(id);
  }

  @ApiOperation({ summary: 'Update template' })
  @ApiParam({ name: 'id', description: 'Template id' })
  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateContentTemplateDto,
    @Req() req: { ip?: string },
  ) {
    const updated = await this.templates.update(id, {
        title: dto.title,
        body: dto.body,
        contentType: dto.contentType,
        tags: dto.tags,
        variables: dto.variables as unknown as TemplateVariable[],
      } as UpdateTemplateInput,);
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

  @ApiOperation({ summary: 'Delete template' })
  @ApiParam({ name: 'id', description: 'Template id' })
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
   * Resolve placeholders (`{{variableKey}}`) in a template's title and body.
   * Returns the resolved title and body strings; the frontend uses this to
   * preview the result of variable substitution before seeding a draft.
   */
  @ApiOperation({ summary: 'Resolve template variables', description: 'Substitutes `{{variableKey}}` placeholders with provided values, falling back to variable defaults.' })
  @ApiParam({ name: 'id', description: 'Template id' })
  @Post(':id/resolve')
  @ApiOkResponse({ description: 'Resolved title and body.' })
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveTemplateDto,
  ) {
    return this.templates.resolve(id, dto.values ?? {});
  }

  /**
   * Apply a template to seed a new draft. Returns the input shape for
   * `ContentService.create`; the frontend persists it as DRAFT content or loads
   * it into the editor.
   */
  @ApiOperation({ summary: 'Apply template', description: 'Seeds a new draft from a template. Returns the input shape for content creation.' })
  @ApiParam({ name: 'id', description: 'Template id' })
  @Post(':id/apply')
  @ApiCreatedResponse({ description: 'Seed shape for a new draft.' })
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
      values: dto.values,
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
