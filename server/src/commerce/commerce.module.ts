import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { BasketController, CheckoutController, OrdersController, PaymentsController, SupportController } from './commerce.controller';
import { CommerceService } from './commerce.service';

@Module({
  imports: [CatalogModule],
  controllers: [BasketController, CheckoutController, OrdersController, PaymentsController, SupportController],
  providers: [CommerceService],
  exports: [CommerceService],
})
export class CommerceModule {}
