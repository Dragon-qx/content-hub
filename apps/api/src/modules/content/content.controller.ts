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
import { ContentService } from './content.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CreateContentDto,
  UpdateContentDto,
  CreateContentVersionDto,
  RollbackVersionDto,
  ListContentQueryDto,
  CalendarQueryDto,
  SubmitContentDto,
  ApproveContentDto,
  RejectContentDto,
} from './dto/content.dto';
import { ContentStatus } from '@prisma/client';

@Controller('contents')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateContentDto,
    @Req() req: { ip?: string },
  ) {
    const created = await this.content.create(dto, user.userId);
    await this.audit.log(
      'CREATE',
      user.userId,
      'Content',
      created.id,
      { title: dto.title, contentType: dto.contentType },
      req.ip,
    );
    return created;
  }

  @Get()
  findAll(@Query() query: ListContentQueryDto) {
    return this.content.findAll({
      skip: query.skip,
      take: query.take,
      status: query.status,
      teamId: query.teamId,
      search: query.search,
    });
  }

  /** Month calendar of scheduled content + publish jobs (grid-friendly). */
  @Get('calendar')
  calendar(@Query() query: CalendarQueryDto) {
    return this.content.calendar(query.year, query.month);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.content.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateContentDto,
    @Req() req: { ip?: string },
  ) {
    const updated = await this.content.update(id, dto, user.userId);
    await this.audit.log(
      'UPDATE',
      user.userId,
      'Content',
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
    const result = await this.content.remove(id);
    await this.audit.log('DELETE', user.userId, 'Content', id, null, req.ip as string | undefined);
    return result;
  }

  @Post(':id/versions')
  async createVersion(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateContentVersionDto,
    @Req() req: { ip?: string },
  ) {
    const result = await this.content.createVersion(id, dto, user.userId);
    await this.audit.log(
      'CREATE_VERSION',
      user.userId,
      'Content',
      id,
      { changeNote: dto.changeNote },
      req.ip,
    );
    return result;
  }

  /** Roll the live content back to a prior version's field values. */
  @Post(':id/rollback')
  async rollback(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RollbackVersionDto,
    @Req() req: { ip?: string },
  ) {
    const result = await this.content.rollbackVersion(
      id,
      dto.version,
      user.userId,
      dto.changeNote,
    );
    await this.audit.log(
      'ROLLBACK',
      user.userId,
      'Content',
      id,
      { toVersion: dto.version, changeNote: dto.changeNote },
      req.ip,
    );
    return result;
  }

  /** Submit a draft for review (DRAFT → IN_REVIEW). */
  @Post(':id/submit')
  async submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitContentDto,
    @Req() req: { ip?: string },
  ) {
    const result = await this.content.submitForReview(
      id,
      user.userId,
      dto.approverId,
    );
    await this.audit.log(
      'SUBMIT',
      user.userId,
      'Content',
      id,
      { approverId: dto.approverId },
      req.ip,
    );
    return result;
  }

  /** Approve content under review (IN_REVIEW → APPROVED). */
  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ApproveContentDto,
    @Req() req: { ip?: string },
  ) {
    const approverId = dto.approverId ?? user.userId;
    const result = await this.content.approveContent(
      id,
      approverId,
      dto.comment,
    );
    await this.audit.log(
      'APPROVE',
      user.userId,
      'Content',
      id,
      { approverId, status: ContentStatus.APPROVED, comment: dto.comment },
      req.ip,
    );
    return result;
  }

  /** Reject content under review (IN_REVIEW → DRAFT). */
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectContentDto,
    @Req() req: { ip?: string },
  ) {
    const approverId = dto.approverId ?? user.userId;
    const result = await this.content.rejectContent(id, approverId, dto.reason);
    await this.audit.log(
      'REJECT',
      user.userId,
      'Content',
      id,
      { approverId, reason: dto.reason },
      req.ip,
    );
    return result;
  }

  /** Archive content. */
  @Post(':id/archive')
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    const result = await this.content.archive(id, user.userId);
    await this.audit.log(
      'ARCHIVE',
      user.userId,
      'Content',
      id,
      { status: ContentStatus.ARCHIVED },
      req.ip,
    );
    return result;
  }
}
