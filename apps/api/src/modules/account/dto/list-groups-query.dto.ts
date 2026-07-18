import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ListGroupsQueryDto {
  @ApiProperty({ description: 'Team id' })
  @IsString()
  @MinLength(1)
  teamId!: string;
}
