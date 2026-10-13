import { Module } from '@nestjs/common';
import { AccountController, NotificationsController } from './account.controller';

@Module({
  controllers: [AccountController, NotificationsController],
})
export class AccountModule {}
