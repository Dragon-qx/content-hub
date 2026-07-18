import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min, Max, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Preview how a piece of content will be adapted for one or more target
 * platforms. The caller supplies the raw copy plus the media that will travel
 * with it; the engine never touches the database — it is a pure projection so
 * it can run in the publish pipeline and in the live preview pane alike.
 */
export class PreviewAdaptationDto {
  @ApiPropertyOptional({ description: 'Raw body copy to project' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Content type', default: 'TEXT' })
  @IsOptional()
  @IsString()
  contentType?: string = 'TEXT';

  /** Number of image assets attached to the content. */
  @ApiPropertyOptional({ description: 'Number of image assets', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  imageCount?: number = 0;

  /** Number of video assets attached to the content. */
  @ApiPropertyOptional({ description: 'Number of video assets', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  videoCount?: number = 0;

  /**
   * Length (seconds) of the primary video. Used to enforce each platform's
   * minimum-duration rule (e.g. Douyin requires >= 15s).
   */
  @ApiPropertyOptional({ description: 'Primary video length in seconds', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  videoDurationSec?: number = 0;

  /**
   * Target platforms to preview. Empty array means "all supported platforms".
   */
  @ApiPropertyOptional({
    description: 'Target platforms (empty = all)',
    type: [String],
    default: [],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  platforms?: string[] = [];
}

/**
 * Query the rule catalog. When `platform` is omitted every platform's rules
 * are returned, otherwise just the one requested.
 */
export class PlatformRulesQueryDto {
  @ApiPropertyOptional({ description: 'Single platform to fetch (omit for all)' })
  @IsOptional()
  @IsString()
  platform?: string;
}
