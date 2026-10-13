import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StreamStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceService } from '../commerce/commerce.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async expireHolds() {
    await this.commerce.expireHolds();
  }

  /** Local ingest stand-in. A real facility console calls the operator heartbeat instead. */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async keepLiveSessionsHealthy() {
    if (process.env.LOCAL_STREAM_KEEPALIVE === 'false') return;
    const result = await this.prisma.streamSession.updateMany({
      where: { status: StreamStatus.LIVE },
      data: { heartbeatAt: new Date() },
    });
    if (result.count) this.logger.debug(`Refreshed ${result.count} live session heartbeat(s)`);
  }
}
