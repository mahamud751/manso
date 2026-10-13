import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';

@ApiTags('Catalogue')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('config')
  @ApiOperation({
    summary: 'Public operating configuration',
    description: 'Broadcast and delivery times are Bangladesh time. Money elsewhere in the API is integer poisha.',
  })
  config() {
    return {
      currency: 'BDT',
      poishaPerTaka: 100,
      timezone: 'Asia/Dhaka',
      broadcastFrom: '10:00',
      deliveryFrom: '14:00',
      holdMinutes: Number(process.env.HOLD_MINUTES ?? 10),
      supportPhone: '+8801711002200',
      sandboxPayments: process.env.PAYMENT_SANDBOX === 'true',
      languages: ['EN', 'BN'],
    };
  }

  @Get('branches')
  @ApiOperation({ summary: 'List active branches' })
  @ApiQuery({ name: 'q', required: false, example: 'Uposhahar' })
  branches(@Query('q') q?: string) {
    return this.catalog.listBranches(q);
  }

  @Get('branches/:id')
  @ApiOperation({ summary: 'Branch details, hours and zones' })
  branch(@Param('id') id: string) {
    return this.catalog.getBranch(id);
  }

  @Get('serviceability')
  @ApiOperation({
    summary: 'Check whether an area can be served',
    description: 'Watching is available anywhere. Fulfilment depends on a matching branch zone.',
  })
  @ApiQuery({ name: 'area', required: true, example: 'Uposhahar' })
  @ApiQuery({ name: 'branchId', required: false })
  serviceability(@Query('area') area = '', @Query('branchId') branchId?: string) {
    return this.catalog.serviceability(area, branchId);
  }

  @Get('products')
  @ApiOperation({
    summary: 'Catalogue for a branch',
    description:
      'Prices and available grams come from the current price version and the released batch. Availability is server authoritative.',
  })
  @ApiQuery({ name: 'branchId', required: true })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'kind', required: false, enum: ['ALL', 'BEEF', 'BONELESS', 'MINCE'] })
  @ApiOkResponse({ description: 'Products with pricePerKgPoisha and availableGrams.' })
  products(@Query('branchId') branchId = '', @Query('q') q?: string, @Query('kind') kind?: string) {
    return this.catalog.listProducts(branchId, q, kind);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Product detail for a branch' })
  @ApiQuery({ name: 'branchId', required: true })
  product(@Param('id') id: string, @Query('branchId') branchId = '') {
    return this.catalog.getProduct(id, branchId);
  }

  @Get('policies/:slug')
  @ApiOperation({ summary: 'Privacy or terms page' })
  policy(@Param('slug') slug: string) {
    return this.catalog.getPolicy(slug);
  }
}
