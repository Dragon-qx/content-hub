import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { TeamAccessModule } from '../common/team-access/team-access.module';

/**
 * Account health monitoring. Depends on global modules (Prisma/Crypto/
 * Notification) plus TeamAccessModule for team-membership enforcement.
 */
@Module({
  imports: [TeamAccessModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
