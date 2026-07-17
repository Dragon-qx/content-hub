import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountService } from './account.service';
import { BindAccountDto, ListAccountsQuery } from './dto/account.dto';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAccountsQuery) {
    if (query.teamId) {
      return this.accountService.listForTeam(query.teamId);
    }
    return this.accountService.listForUser(user.userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.accountService.get(id);
  }

  @Post()
  bind(@CurrentUser() user: AuthUser, @Body() dto: BindAccountDto) {
    return this.accountService.bind(dto.teamId, dto);
  }

  @Post(':id/sync')
  sync(@Param('id') id: string) {
    return this.accountService.sync(id);
  }

  @Delete(':id')
  unbind(@Param('id') id: string) {
    return this.accountService.unbind(id);
  }
}
