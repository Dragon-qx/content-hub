import { IsString, MinLength } from 'class-validator';

/** Path param DTO for targeting a single account. */
export class AccountIdParam {
  @IsString()
  @MinLength(1)
  id: string;
}

/** Path param DTO for targeting a team. */
export class TeamIdParam {
  @IsString()
  @MinLength(1)
  teamId: string;
}
