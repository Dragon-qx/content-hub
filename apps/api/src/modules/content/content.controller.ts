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
  ListContentQueryDto,
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
}
