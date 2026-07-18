import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiTags('System')
  @ApiOperation({ summary: 'Liveness probe', description: 'Health check used by orchestrators. Always returns service status.' })
  @ApiOkResponse({ description: 'Service status.' })
  @Get('health')
  health() {
    return this.appService.health();
  }
}
