import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { AddMemberDto, CreateTeamDto, UpdateTeamDto } from './dto/team.dto';
import { TeamService } from './team.service';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly audit: AuditService,
  ) {}

  @ApiOperation({ summary: 'Create a team', description: 'The creator becomes the OWNER of the new team.' })
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTeamDto,
    @Req() req: { ip?: string },
  ) {
    const team = await this.teamService.create(user.userId, dto);
    await this.audit.log(
      'CREATE',
      user.userId,
      'Team',
      team.id,
      { name: dto.name },
      req.ip,
    );
    return team;
  }

  @ApiOperation({ summary: 'List my teams', description: 'Returns all teams the caller belongs to.' })
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.teamService.findAllForUser(user.userId);
  }

  @ApiOperation({ summary: 'Get team by id' })
  @ApiParam({ name: 'id', description: 'Team id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teamService.findById(id);
  }

  @ApiOperation({ summary: 'Update team' })
  @ApiParam({ name: 'id', description: 'Team id' })
  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTeamDto,
    @Req() req: { ip?: string },
  ) {
    const updated = await this.teamService.update(id, user.userId, dto);
    await this.audit.log(
      'UPDATE',
      user.userId,
      'Team',
      id,
      { changed: dto },
      req.ip,
    );
    return updated;
  }

  @ApiOperation({ summary: 'Delete team' })
  @ApiParam({ name: 'id', description: 'Team id' })
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    const result = await this.teamService.remove(id, user.userId);
    await this.audit.log('DELETE', user.userId, 'Team', id, null, req.ip);
    return result;
  }

  @ApiOperation({ summary: 'List team members' })
  @ApiParam({ name: 'id', description: 'Team id' })
  @Get(':id/members')
  listMembers(@Param('id') id: string) {
    return this.teamService.listMembers(id);
  }

  @ApiOperation({ summary: 'Add member to team' })
  @ApiParam({ name: 'id', description: 'Team id' })
  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddMemberDto,
    @Req() req: { ip?: string },
  ) {
    const member = await this.teamService.addMember(id, user.userId, dto);
    await this.audit.log(
      'ADD_MEMBER',
      user.userId,
      'Team',
      id,
      { memberUserId: dto.userId, memberId: member.id },
      req.ip,
    );
    return member;
  }

  @ApiOperation({ summary: 'Remove member from team' })
  @ApiParam({ name: 'id', description: 'Team id' })
  @ApiParam({ name: 'memberId', description: 'Member id' })
  @Delete(':id/members/:memberId')
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string },
  ) {
    const result = await this.teamService.removeMember(
      id,
      user.userId,
      memberId,
    );
    await this.audit.log(
      'REMOVE_MEMBER',
      user.userId,
      'Team',
      id,
      { memberId },
      req.ip,
    );
  }
}
