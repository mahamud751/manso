import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { LiveModule } from './live/live.module';
import { CommerceModule } from './commerce/commerce.module';
import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { JobsService } from './jobs/jobs.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    CatalogModule,
    LiveModule,
    CommerceModule,
    AccountModule,
    AdminModule,
  ],
  providers: [JobsService],
})
export class AppModule {}
