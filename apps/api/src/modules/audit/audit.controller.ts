import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAuditDto, ListAuditQueryDto } from './dto/audit.dto';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Post()
  log(@Body() dto: CreateAuditDto, @Req() req: { ip?: string }) {
    return this.audit.log(
      dto.action,
      dto.userId,
      dto.resourceType,
      dto.resourceId,
      dto.details,
      dto.ipAddress ?? req?.ip,
    );
  }

  @Get()
  findAll(@Query() query: ListAuditQueryDto) {
    return this.audit.findAll({
      skip: query.skip,
      take: query.take,
      userId: query.userId,
      action: query.action,
      entityType: query.resourceType,
      entityId: query.resourceId,
    });
  }

  @Get(':resourceType/:resourceId')
  findByResource(
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.audit.findByResource(resourceType, resourceId);
  }
}
