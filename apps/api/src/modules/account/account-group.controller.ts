import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountGroupService } from './account-group.service';
import { CreateAccountGroupDto, UpdateAccountGroupDto } from './dto/account-group.dto';
import { ListGroupsQueryDto } from './dto/list-groups-query.dto';

@ApiTags('Account Groups')
@ApiBearerAuth()
@Controller('account-groups')
@UseGuards(JwtAuthGuard)
export class AccountGroupController {
  constructor(private readonly service: AccountGroupService) {}

  @ApiOperation({ summary: 'Create an account group' })
  @ApiCreatedResponse({ description: 'Group created.' })
  @Post()
  create(@Query('teamId') teamId: string, @Body() dto: CreateAccountGroupDto) {
    return this.service.create(teamId, dto);
  }

  @ApiOperation({ summary: 'List groups for a team' })
  @Get()
  list(@Query() query: ListGroupsQueryDto) {
    return this.service.listForTeam(query.teamId);
  }

  @ApiOperation({ summary: 'Get group detail with accounts' })
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @ApiOperation({ summary: 'Update a group' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountGroupDto) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete a group' })
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @ApiOperation({ summary: 'Assign an account to this group' })
  @Post(':id/accounts')
  assign(@Param('id') id: string, @Body() body: { accountId: string }) {
    return this.service.assignAccount(id, body.accountId);
  }

  @ApiOperation({ summary: 'Remove an account from this group' })
  @Delete(':id/accounts/:accountId')
  remove(@Param('id') id: string, @Param('accountId') accountId: string) {
    return this.service.removeAccount(id, accountId);
  }
}
