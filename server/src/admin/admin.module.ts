import { Module } from '@nestjs/common';
import { LiveModule } from '../live/live.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [LiveModule],
  controllers: [AdminController],
})
export class AdminModule {}
