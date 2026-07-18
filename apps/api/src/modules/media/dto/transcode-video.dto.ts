import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

/** Transcode resolutions we support. */
export const TRANSCODE_RESOLUTIONS = ['720p', '1080p'] as const;
export type TranscodeResolution = (typeof TRANSCODE_RESOLUTIONS)[number];

/** Container formats supported by the transcode endpoint. */
export const TRANSCODE_FORMATS = ['mp4', 'webm'] as const;
export type TranscodeFormat = (typeof TRANSCODE_FORMATS)[number];

/** Request body for video transcoding (multipart). */
export class TranscodeVideoDto {
  @ApiPropertyOptional({
    description: 'Target resolutions (defaults to all supported).',
    enum: TRANSCODE_RESOLUTIONS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  resolutions?: TranscodeResolution[];

  @ApiPropertyOptional({
    description: 'Container format (defaults to mp4).',
    enum: TRANSCODE_FORMATS,
    default: 'mp4',
  })
  @IsOptional()
  @IsEnum(TRANSCODE_FORMATS)
  format?: TranscodeFormat;
}
