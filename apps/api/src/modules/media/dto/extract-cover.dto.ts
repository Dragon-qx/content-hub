import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/** Request body for extracting a cover frame from a video (multipart). */
export class ExtractCoverDto {
  @ApiProperty({
    description: 'Time offset in seconds to extract the frame from.',
    example: 5,
  })
  @IsInt()
  @Min(0)
  timeSeconds!: number;
}
