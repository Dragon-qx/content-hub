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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAuditDto, ListAuditQueryDto } from './dto/audit.dto';

/** Escape a single CSV field per RFC 4180 (quote if it contains , " or newline). */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @ApiOperation({ summary: 'Append an audit entry', description: 'Records an opaque audit event (also emitted automatically by the content pipeline).' })
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

  @ApiOperation({ summary: 'List audit log', description: 'Paginated, filterable listing of the audit trail.' })
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
  @ApiOperation({ summary: 'Export audit log as CSV', description: 'Downloads the filtered audit trail as a CSV attachment.' })
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

  @ApiOperation({ summary: 'Audit trail for a resource', description: 'Returns every audit entry for a given resource type + id.' })
  @ApiParam({ name: 'resourceType', description: 'Resource type (e.g. Content, Team)' })
  @ApiParam({ name: 'resourceId', description: 'Resource id' })
  @Get(':resourceType/:resourceId')
  findByResource(
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.audit.findByResource(resourceType, resourceId);
  }
}
