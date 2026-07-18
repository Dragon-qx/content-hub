import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Path param DTO for targeting a single account. */
export class AccountIdParam {
  @ApiProperty({ description: 'Account id to evaluate' })
  @IsString()
  @MinLength(1)
  id: string;
}

/** Path param DTO for targeting a team. */
export class TeamIdParam {
  @ApiProperty({ description: 'Team id to evaluate' })
  @IsString()
  @MinLength(1)
  teamId: string;
}
