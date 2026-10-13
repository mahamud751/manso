import { Injectable } from '@nestjs/common';
import { StreamStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { fail } from '../common/http';
import { dhakaDateString } from '../common/time';

const VIEWER_WINDOW_MS = 90_000;
const RECONNECT_MS = 30_000;
const OFFLINE_MS = 90_000;

@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async listSessions(branchId?: string) {
    const where = branchId ? { branchId, publicOutput: true } : { publicOutput: true };
    const sessions = await this.prisma.streamSession.findMany({
      where,
      orderBy: { scheduledStart: 'desc' },
      take: 20,
      include: { batch: true, branch: true },
    });
    return Promise.all(sessions.map((session) => this.present(session, false)));
  }

  async getSession(id: string) {
    const session = await this.requireSession(id);
    return this.present(session, true);
  }

  async heartbeat(id: string, viewerKey: string) {
    if (!viewerKey || viewerKey.length < 8 || viewerKey.length > 80) {
      throw fail(400, 'A viewer key is required.', 'VIEWER_KEY');
    }
    const session = await this.requireSession(id);
    const display = await this.displayStatus(session);
    if (display === 'LIVE' || display === 'RECONNECTING') {
      await this.prisma.streamViewer.upsert({
        where: { sessionId_viewerKey: { sessionId: id, viewerKey } },
        update: { lastSeen: new Date() },
        create: { sessionId: id, viewerKey, lastSeen: new Date() },
      });
    }
    const fresh = await this.requireSession(id);
    return this.present(fresh, false);
  }

  async ask(id: string, user: User, message: string) {
    const text = message.trim();
    if (text.length < 2 || text.length > 500) {
      throw fail(400, 'Write a short question.', 'QUESTION_INVALID');
    }
    await this.requireSession(id);
    const question = await this.prisma.liveQuestion.create({
      data: { sessionId: id, userId: user.id, message: text },
    });
    return { id: question.id, message: question.message, createdAt: question.createdAt };
  }

  async myQuestions(id: string, user: User) {
    const rows = await this.prisma.liveQuestion.findMany({
      where: { sessionId: id, userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((row) => ({ id: row.id, message: row.message, createdAt: row.createdAt }));
  }

  async listReplays(branchId?: string) {
    const rows = await this.prisma.replayAsset.findMany({
      where: { published: true, ...(branchId ? { branchId } : {}) },
      include: { batch: true },
      orderBy: { recordedAt: 'desc' },
    });
    return rows.map((row) => this.presentReplay(row));
  }

  async getReplay(id: string) {
    const row = await this.prisma.replayAsset.findFirst({
      where: { id, published: true },
      include: { batch: true },
    });
    if (!row) throw fail(404, 'Replay not found.', 'REPLAY_NOT_FOUND');
    return this.presentReplay(row);
  }

  async countView(id: string) {
    const row = await this.prisma.replayAsset.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      include: { batch: true },
    });
    return this.presentReplay(row);
  }

  async present(
    session: {
      id: string;
      branchId: string;
      batchId: string | null;
      titleEn: string;
      titleBn: string;
      summaryEn: string;
      summaryBn: string;
      status: StreamStatus;
      scheduledStart: Date;
      scheduledEnd: Date;
      startedAt: Date | null;
      endedAt: Date | null;
      playbackUrl: string | null;
      posterUrl: string | null;
      heartbeatAt: Date | null;
      batch?: { id: string; code: string; releaseStatus: string; preparationDate: Date } | null;
    },
    withPins: boolean,
  ) {
    const viewerCount = await this.prisma.streamViewer.count({
      where: { sessionId: session.id, lastSeen: { gt: new Date(Date.now() - VIEWER_WINDOW_MS) } },
    });
    const status = this.deriveStatus(session);
    let pins: unknown[] = [];
    if (withPins) {
      const links = await this.prisma.streamProduct.findMany({
        where: { sessionId: session.id },
        include: { product: { include: { options: { orderBy: { sort: 'asc' } } } } },
        orderBy: { sort: 'asc' },
      });
      pins = await Promise.all(
        links.map((link) => this.catalog.presentProduct(link.product, session.branchId)),
      );
    }
    return {
      id: session.id,
      branchId: session.branchId,
      title: { en: session.titleEn, bn: session.titleBn },
      summary: { en: session.summaryEn, bn: session.summaryBn },
      status,
      storedStatus: session.status,
      scheduledStart: session.scheduledStart,
      scheduledEnd: session.scheduledEnd,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      serviceDate: dhakaDateString(session.scheduledStart),
      playbackUrl: session.playbackUrl,
      posterUrl: this.catalog.media(session.posterUrl),
      viewerCount,
      batch: session.batch
        ? {
            id: session.batch.id,
            code: session.batch.code,
            releaseStatus: session.batch.releaseStatus,
            preparationDate: session.batch.preparationDate.toISOString().slice(0, 10),
          }
        : null,
      pins,
    };
  }

  deriveStatus(session: { status: StreamStatus; heartbeatAt: Date | null }) {
    if (session.status !== StreamStatus.LIVE) return session.status;
    if (!session.heartbeatAt) return 'OFFLINE';
    const age = Date.now() - session.heartbeatAt.getTime();
    if (age > OFFLINE_MS) return 'OFFLINE';
    if (age > RECONNECT_MS) return 'RECONNECTING';
    return 'LIVE';
  }

  async displayStatus(session: { id: string; status: StreamStatus; heartbeatAt: Date | null }) {
    return this.deriveStatus(session);
  }

  private async requireSession(id: string) {
    const session = await this.prisma.streamSession.findFirst({
      where: { id, publicOutput: true },
      include: { batch: true },
    });
    if (!session) throw fail(404, 'Session not found.', 'SESSION_NOT_FOUND');
    return session;
  }

  private presentReplay(row: {
    id: string;
    batchId: string;
    branchId: string;
    titleEn: string;
    titleBn: string;
    summaryEn: string;
    summaryBn: string;
    recordedAt: Date;
    durationSec: number;
    viewCount: number;
    posterUrl: string | null;
    playbackUrl: string | null;
    orderable: boolean;
    batch: { code: string; releaseStatus: string; preparationDate: Date };
  }) {
    return {
      id: row.id,
      branchId: row.branchId,
      title: { en: row.titleEn, bn: row.titleBn },
      summary: { en: row.summaryEn, bn: row.summaryBn },
      recordedAt: row.recordedAt,
      serviceDate: dhakaDateString(row.recordedAt),
      durationSec: row.durationSec,
      viewCount: row.viewCount,
      posterUrl: this.catalog.media(row.posterUrl),
      playbackUrl: row.playbackUrl,
      orderable: row.orderable && row.batch.releaseStatus === 'RELEASED',
      soldOut: !row.orderable || row.batch.releaseStatus !== 'RELEASED',
      batch: {
        id: row.batchId,
        code: row.batch.code,
        releaseStatus: row.batch.releaseStatus,
        preparationDate: row.batch.preparationDate.toISOString().slice(0, 10),
      },
    };
  }
}
