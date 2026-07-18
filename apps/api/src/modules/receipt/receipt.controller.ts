import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  GenerateReceiptDto,
  ListReceiptsQueryDto,
} from './dto/receipt.dto';
import { PublishReceiptService } from './receipt.service';

@ApiTags('Receipts')
@ApiBearerAuth()
@Controller('receipts')
@UseGuards(JwtAuthGuard)
export class ReceiptController {
  constructor(private readonly receipts: PublishReceiptService) {}

  @ApiOperation({
    summary: 'Generate a publish receipt',
    description:
      'Seals a tamper-evident receipt for a publish event, attempts a ' +
      'screenshot capture (via the SCREENSHOT_PROVIDER seam), and always ' +
      'retains a card image. Idempotent by default.',
  })
  @ApiCreatedResponse({ description: 'Receipt generated.' })
  @ApiConflictResponse({ description: 'A receipt already exists (non-idempotent call).' })
  @Post()
  generate(@Body() dto: GenerateReceiptDto) {
    return this.receipts.generate(dto);
  }

  @ApiOperation({ summary: 'List receipts for a content piece' })
  @ApiOkResponse({ description: 'Receipt list.' })
  @Get()
  list(@Query() query: ListReceiptsQueryDto) {
    return this.receipts.listByContent(query.contentId);
  }

  @ApiOperation({ summary: 'Get a receipt by id' })
  @ApiParam({ name: 'id', description: 'Receipt id' })
  @ApiOkResponse({ description: 'Receipt detail.' })
  @ApiNotFoundResponse({ description: 'Receipt not found.' })
  @Get(':id')
  get(@Param('id') id: string) {
    return this.receipts.get(id);
  }

  @ApiOperation({ summary: 'Verify a receipt hash against its stored tuple' })
  @ApiParam({ name: 'id', description: 'Receipt id' })
  @ApiOkResponse({ description: 'Verification result.' })
  @Get(':id/verify')
  verify(@Param('id') id: string) {
    return this.receipts.verify(id);
  }
}
