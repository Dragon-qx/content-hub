import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAuditDto, ListAuditQueryDto } from './dto/audit.dto';

/** Escape a single CSV field per RFC 4180 (quote if it contains , " ornewline). */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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
      from: query.from,
      to: query.to,
      operator: query.operator,
    });
  }

  /** Export the filtered audit trail as CSV (RFC 4180). */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  async export(@Query() query: ListAuditQueryDto, @Res() res: Response) {
    const rows = await this.audit.exportAll({
      userId: query.userId,
      action: query.action,
      entityType: query.resourceType,
      entityId: query.resourceId,
      from: query.from,
      to: query.to,
      operator: query.operator,
    });

    const header = [
      'id',
      'createdAt',
      'operatorId',
      'operatorName',
      'operatorEmail',
      'action',
      'resourceType',
      'resourceId',
      'ipAddress',
      'metadata',
    ]
      .map(csvField)
      .join(',');

    const lines = rows.map((r) =>
      [
        r.id,
        r.createdAt.toISOString(),
        r.userId,
        r.user?.name ?? '',
        r.user?.email ?? '',
        r.action,
        r.entityType,
        r.entityId ?? '',
        r.ipAddress ?? '',
        r.metadata ?? '',
      ]
        .map(csvField)
        .join(','),
    );

    return res.send([header, ...lines].join('\n'));
  }

  @Get(':resourceType/:resourceId')
  findByResource(
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.audit.findByResource(resourceType, resourceId);
  }
}
