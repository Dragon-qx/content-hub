import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MediaType } from '@prisma/client';

/** Query params for listing media assets (validation + pagination). */
export class MediaQueryDto {
  @ApiPropertyOptional({ description: 'Filter by owning content id' })
  @IsOptional()
  @IsString()
  contentId?: string;

  @ApiPropertyOptional({ description: 'Filter by media type', enum: MediaType })
  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType;

  @ApiPropertyOptional({ description: 'Search term' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}
