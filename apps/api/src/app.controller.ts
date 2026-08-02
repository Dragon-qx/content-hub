import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { MetricsService } from './common/metrics/metrics.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly metrics: MetricsService,
  ) {}

  @ApiTags('System')
  @ApiOperation({ summary: 'Liveness probe', description: 'Health check used by orchestrators. Always returns service status.' })
  @ApiOkResponse({ description: 'Service status.' })
  @Get('health')
  health() {
    return this.appService.health();
  }

  @ApiTags('System')
  @ApiOperation({ summary: 'Readiness probe', description: 'Returns service readiness including dependency status.' })
  @ApiOkResponse({ description: 'Readiness status.' })
  @Get('ready')
  ready() {
    return {
      status: 'ok',
      service: 'content-hub-api',
      timestamp: new Date().toISOString(),
      metrics: this.metrics.getMetrics(),
    };
  }

  @ApiTags('System')
  @ApiOperation({ summary: 'Metrics snapshot', description: 'Returns current metrics counters, gauges, and histograms.' })
  @ApiOkResponse({ description: 'Metrics data.' })
  @Get('metrics')
  getMetrics() {
    return this.metrics.getMetrics();
  }
}
