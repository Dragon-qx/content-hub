import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBooleanString()
  isActive?: boolean;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: 'Current user profile' })
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.userService.findById(user.userId);
  }

  @ApiOperation({ summary: 'Update current user profile' })
  @Put('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return this.userService.update(user.userId, dto);
  }

  @ApiOperation({ summary: 'List users (admin/owner only)', description: 'Paginated, searchable listing of the organization's users.' })
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  list(@Query() query: ListUsersQueryDto) {
    return this.userService.list({
      skip: query.skip,
      take: query.take,
      search: query.search,
      isActive: query.isActive,
    });
  }

  @ApiOperation({ summary: 'Delete a user (admin/owner only)' })
  @ApiParam({ name: 'id', description: 'User id' })
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
