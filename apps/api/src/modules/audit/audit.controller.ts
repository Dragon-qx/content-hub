import { Body, Controller, Get, Param, Post, Query, ParseIntPipe } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Post() log(@Body() dto: any) {
    return this.audit.log(dto);
  }
  @Get() findAll(
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) { return this.audit.findAll({ skip, take }); }
  @Get(':resourceType/:resourceId') findByResource(@Param('resourceType') rt: string, @Param('resourceId') ri: string) {
    return this.audit.findByResource(rt, ri);
  }
}
