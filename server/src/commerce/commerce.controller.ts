import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { SupportTopic, User } from '@prisma/client';
import { JwtAuthGuard, fail } from '../common/http';
import { CommerceService } from './commerce.service';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

class BasketItemDto {
  @ApiProperty({ example: 'branch id' })
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ description: 'Grams. 0 removes the line. Must match the product increment, usually 500.', example: 1000 })
  @IsInt()
  @Min(0)
  grams!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  optionId?: string;

  @ApiProperty({ required: false, example: 'Smaller curry pieces' })
  @IsOptional()
  @IsString()
  note?: string;
}

class QuoteDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty({ enum: ['DELIVERY', 'COLLECTION'] })
  @IsIn(['DELIVERY', 'COLLECTION'])
  mode!: 'DELIVERY' | 'COLLECTION';

  @ApiProperty()
  @IsString()
  slotTemplateId!: string;

  @ApiProperty({ example: '2026-10-13', description: 'Service date in Asia/Dhaka.' })
  @IsString()
  serviceDate!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  addressId?: string;
}

class OrderDto {
  @ApiProperty()
  @IsString()
  quoteId!: string;

  @ApiProperty({ enum: ['BKASH', 'CARD', 'CASH'] })
  @IsIn(['BKASH', 'CARD', 'CASH'])
  method!: 'BKASH' | 'CARD' | 'CASH';

  @ApiProperty({ description: 'Customer must accept the current terms.' })
  @IsBoolean()
  termsAccepted!: boolean;
}

class SandboxDto {
  @ApiProperty()
  @IsString()
  orderId!: string;

  @ApiProperty({ enum: ['PAID', 'FAILED'], description: 'Local gateway outcome. The server signs the webhook itself.' })
  @IsIn(['PAID', 'FAILED'])
  outcome!: 'PAID' | 'FAILED';
}

class SupportDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ enum: ['DELIVERY_ISSUE', 'MISSING_ITEM', 'WRONG_CUT', 'REFUND', 'OTHER'] })
  @IsIn(['DELIVERY_ISSUE', 'MISSING_ITEM', 'WRONG_CUT', 'REFUND', 'OTHER'])
  topic!: SupportTopic;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  message!: string;

  @ApiProperty({ required: false, description: 'Refund amount in poisha. Defaults to the frozen order total.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountPoisha?: number;
}

class WebhookDto {
  @ApiProperty({ example: 'manso' })
  merchant!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  transactionId!: string;

  @ApiProperty({ description: 'Must equal the frozen order total in poisha.' })
  amountPoisha!: number;

  @ApiProperty({ example: 'BDT' })
  currency!: string;

  @ApiProperty({ enum: ['PAID', 'FAILED', 'CANCELLED'] })
  status!: string;
}

@ApiTags('Basket')
@Controller()
export class BasketController {
  constructor(private readonly commerce: CommerceService) {}

  @Get('basket')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current basket with live prices. Adding an item does not reserve stock.' })
  basket(@Req() req: { user: User }) {
    return this.commerce.getBasket(req.user);
  }

  @Post('basket/items')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set a basket line. Grams 0 removes it.' })
  upsert(@Req() req: { user: User }, @Body() body: BasketItemDto) {
    return this.commerce.upsertItem(req.user, body);
  }

  @Post('basket/clear')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Empty the basket' })
  clear(@Req() req: { user: User }) {
    return this.commerce.clearBasket(req.user);
  }
}

@ApiTags('Checkout')
@Controller()
export class CheckoutController {
  constructor(private readonly commerce: CommerceService) {}

  @Get('slots')
  @ApiOperation({
    summary: 'Selectable delivery or collection slots',
    description:
      'Delivery slots start at the branch delivery time (14:00 Asia/Dhaka) and never earlier. Started or full slots are omitted. If today is finished, the next day is returned with movedToNextDay.',
  })
  @ApiQuery({ name: 'branchId', required: true })
  @ApiQuery({ name: 'mode', required: true, enum: ['DELIVERY', 'COLLECTION'] })
  @ApiQuery({ name: 'date', required: false, example: '2026-10-13' })
  slots(@Query('branchId') branchId = '', @Query('mode') mode = 'DELIVERY', @Query('date') date?: string) {
    return this.commerce.slots(branchId, mode, date);
  }

  @Post('checkout/holds')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Quote the basket and hold stock and slot capacity',
    description:
      'Hold length is HOLD_MINUTES (10 by default). Prices and fees freeze until expiresAt. A second quote releases the previous hold.',
  })
  quote(@Req() req: { user: User }, @Body() body: QuoteDto) {
    return this.commerce.createQuote(req.user, body);
  }

  @Get('checkout/holds/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read a live price hold before it expires' })
  held(@Req() req: { user: User }, @Param('id') id: string) {
    return this.commerce.getQuote(req.user, id);
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Place an order from a live quote',
    description:
      'Send an Idempotency-Key header. Cash commits stock immediately and stays CASH_DUE. bKash and card stay PENDING until a signed webhook. A client redirect is not payment.',
  })
  place(
    @Req() req: { user: User },
    @Body() body: OrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.commerce.createOrder(req.user, body, idempotencyKey);
  }
}

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly commerce: CommerceService) {}

  @Get()
  @ApiOperation({ summary: 'Order history' })
  @ApiQuery({ name: 'scope', required: false, enum: ['active', 'past', 'all'] })
  list(@Req() req: { user: User }, @Query('scope') scope: 'active' | 'past' | 'all' = 'all') {
    return this.commerce.listOrders(req.user, scope);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Order detail, timeline, payment and refund state' })
  get(@Req() req: { user: User }, @Param('id') id: string) {
    return this.commerce.getOrder(req.user, id);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Frozen receipt. Totals do not follow today’s prices.' })
  receipt(@Req() req: { user: User }, @Param('id') id: string) {
    return this.commerce.getOrder(req.user, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel before preparation. Paid orders open a refund request.' })
  cancel(@Req() req: { user: User }, @Param('id') id: string) {
    return this.commerce.cancel(req.user, id);
  }

  @Post(':id/reorder')
  @ApiOperation({ summary: 'Copy lines into the basket at current stock and price' })
  reorder(@Req() req: { user: User }, @Param('id') id: string) {
    return this.commerce.reorder(req.user, id);
  }

  @Post(':id/support')
  @ApiOperation({ summary: 'Open a support case or refund request for this order' })
  support(@Req() req: { user: User }, @Param('id') id: string, @Body() body: SupportDto) {
    return this.commerce.openSupport(req.user, { ...body, orderId: id });
  }
}

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private readonly commerce: CommerceService) {}

  @Post('payments/sandbox/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Local sandbox gateway',
    description:
      'Enabled only when PAYMENT_SANDBOX=true. Builds a webhook body, signs it with PAYMENT_WEBHOOK_SECRET, and processes it through the same handler as a provider callback. This is not a production payment integration.',
  })
  sandbox(@Req() req: { user: User }, @Body() body: SandboxDto) {
    return this.commerce.sandboxComplete(req.user, body.orderId, body.outcome);
  }

  @Post('webhooks/payments/:provider')
  @ApiOperation({
    summary: 'Signed payment webhook',
    description:
      'Header X-Manso-Signature is hex HMAC-SHA256 of the raw body using PAYMENT_WEBHOOK_SECRET. The handler checks merchant, currency, amount and order. Replayed transaction ids do not commit stock twice.',
  })
  @ApiBody({ type: WebhookDto })
  webhook(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-manso-signature') signature?: string,
  ) {
    if (provider !== 'sandbox') {
      throw fail(404, 'Unknown payment provider.', 'PROVIDER_UNKNOWN');
    }
    return this.commerce.handleWebhook(req.rawBody ?? Buffer.from(''), signature);
  }
}

@ApiTags('Support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly commerce: CommerceService) {}

  @Post()
  @ApiOperation({ summary: 'General support message' })
  create(@Req() req: { user: User }, @Body() body: SupportDto) {
    return this.commerce.openSupport(req.user, body);
  }
}
