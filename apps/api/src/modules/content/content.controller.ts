import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ContentService } from './content.service';

@Controller('contents')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Post() create(@Body() dto: any) { return this.content.create(dto, 'mock-user'); }
  @Get() findAll(
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) { return this.content.findAll({ skip, take }); }
  @Get(':id') findOne(@Param('id') id: string) { return this.content.findOne(id); }
  @Put(':id') update(@Param('id') id: string, @Body() dto: any) { return this.content.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.content.remove(id); }
}
