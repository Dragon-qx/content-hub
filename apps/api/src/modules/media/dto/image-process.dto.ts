import {
  IsEnum,
  IsInt,
  IsJSON,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Crop region (absolute pixels). */
export class CropDto {
  @ApiProperty({ description: 'Left edge (px)' })
  @IsInt()
  @Min(0)
  left!: number;

  @ApiProperty({ description: 'Top edge (px)' })
  @IsInt()
  @Min(0)
  top!: number;

  @ApiProperty({ description: 'Crop width (px)' })
  @IsInt()
  @Min(1)
  width!: number;

  @ApiProperty({ description: 'Crop height (px)' })
  @IsInt()
  @Min(1)
  height!: number;
}

/** Resize box (aspect preserved, fits inside). */
export class ResizeDto {
  @ApiPropertyOptional({ description: 'Target width (px)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @ApiPropertyOptional({ description: 'Target height (px)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;
}

/** Parsed image-processing operation (validated after JSON.parse of `ops`). */
export class ImageOperationDto {
  @ApiPropertyOptional({ type: CropDto, description: 'Crop region (absolute px)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CropDto)
  crop?: CropDto;

  @ApiPropertyOptional({ type: ResizeDto, description: 'Resize box (aspect preserved)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResizeDto)
  resize?: ResizeDto;

  @ApiPropertyOptional({ description: 'Watermark text, rendered bottom-right' })
  @IsOptional()
  @IsString()
  watermark?: string;

  @ApiPropertyOptional({ enum: ['grayscale', 'blur', 'sharpen'], description: 'Named filter' })
  @IsOptional()
  @IsEnum(['grayscale', 'blur', 'sharpen'])
  filter?: 'grayscale' | 'blur' | 'sharpen';

  @ApiPropertyOptional({ enum: ['jpeg', 'png', 'webp'], description: 'Output format' })
  @IsOptional()
  @IsEnum(['jpeg', 'png', 'webp'])
  format?: 'jpeg' | 'png' | 'webp';

  @ApiPropertyOptional({ description: 'Quality 1-100 (jpeg/webp only)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quality?: number;
}

/** Multipart body for POST /media/process. */
export class ImageProcessDto {
  @ApiProperty({ description: 'Operation config as a JSON string, e.g. {"resize":{"width":800}}' })
  @IsJSON()
  ops!: string;
}
