import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';

@Module({
  imports: [CatalogModule],
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}
