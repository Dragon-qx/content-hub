import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Post() log(@Body() dto: any) {
    return this.audit.log(dto);
  }
  @Get() findAll(@Query() query: PaginationQueryDto) { return this.audit.findAll({ skip: query.skip, take: query.take }); }
  @Get(':resourceType/:resourceId') findByResource(@Param('resourceType') rt: string, @Param('resourceId') ri: string) {
    return this.audit.findByResource(rt, ri);
  }
}
