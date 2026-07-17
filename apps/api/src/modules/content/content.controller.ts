import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CreateContentDto,
  UpdateContentDto,
  CreateContentVersionDto,
  ListContentQueryDto,
  SubmitContentDto,
  ApproveContentDto,
  RejectContentDto,
} from './dto/content.dto';

@Controller('contents')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateContentDto) {
    return this.content.create(dto, user.userId);
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.content.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateContentDto,
  ) {
    return this.content.update(id, dto, user.userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.content.remove(id);
  }

  @Post(':id/versions')
  createVersion(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateContentVersionDto,
  ) {
    return this.content.createVersion(id, dto, user.userId);
  }

  /** Submit a draft for review (DRAFT → IN_REVIEW). */
  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitContentDto,
  ) {
    return this.content.submitForReview(id, user.userId, dto.approverId);
  }

  /** Approve content under review (IN_REVIEW → APPROVED). */
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ApproveContentDto,
  ) {
    return this.content.approveContent(
      id,
      dto.approverId ?? user.userId,
      dto.comment,
    );
  }

  /** Reject content under review (IN_REVIEW → DRAFT). */
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectContentDto,
  ) {
    return this.content.rejectContent(
      id,
      dto.approverId ?? user.userId,
      dto.reason,
    );
  }

  /** Archive content. */
  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.content.archive(id, user.userId);
  }
}
