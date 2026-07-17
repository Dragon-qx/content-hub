import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ContentService } from './content.service';

@Controller('contents')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Post() create(@Body() dto: any) { return this.content.create(dto, 'mock-user'); }
  @Get() findAll(@Query() query: any) {
    const skip = parseInt(query.skip, 10) || 0;
    const take = parseInt(query.take, 10) || 20;
    return this.content.findAll({ skip, take, status: query.status, teamId: query.teamId });
  }
  @Get(':id') findOne(@Param('id') id: string) { return this.content.findOne(id); }
  @Put(':id') update(@Param('id') id: string, @Body() dto: any) { return this.content.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.content.remove(id); }
}
