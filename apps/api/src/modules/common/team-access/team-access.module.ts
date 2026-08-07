import { Module } from '@nestjs/common';
import { TeamAccessService } from './team-access.service';
import { TeamAccessGuard } from './team-access.guard';

@Module({
  providers: [TeamAccessService, TeamAccessGuard],
  exports: [TeamAccessService, TeamAccessGuard],
})
export class TeamAccessModule {}
