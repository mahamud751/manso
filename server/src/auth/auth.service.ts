import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'crypto';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fail } from '../common/http';
import { normalizeBdPhone } from '../common/phone';

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async requestOtp(phoneRaw: string) {
    const phone = normalizeBdPhone(phoneRaw);
    if (!phone) {
      throw fail(400, 'Enter a valid Bangladesh mobile number.', 'PHONE_INVALID');
    }
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const recent = await this.prisma.otpCode.count({ where: { phone, createdAt: { gt: since } } });
    if (recent >= MAX_SENDS) {
      throw fail(429, 'Too many codes were requested. Try again in a few minutes.', 'OTP_RATE_LIMIT');
    }
    const latest = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < RESEND_SECONDS * 1000) {
      throw fail(429, 'Please wait before requesting another code.', 'OTP_RESEND_WAIT');
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash: this.hash(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    this.logger.log(`OTP issued for ${phone.slice(0, 7)}…`);
    const debug = process.env.OTP_DEBUG === 'true';
    return {
      phone,
      expiresInSeconds: OTP_TTL_MS / 1000,
      resendAfterSeconds: RESEND_SECONDS,
      ...(debug ? { debugCode: code } : {}),
    };
  }

  async verify(phoneRaw: string, code: string) {
    const phone = normalizeBdPhone(phoneRaw);
    if (!phone) throw fail(400, 'Enter a valid Bangladesh mobile number.', 'PHONE_INVALID');
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw fail(400, 'Request a code first.', 'OTP_MISSING');
    if (otp.expiresAt.getTime() < Date.now()) {
      throw fail(400, 'That code has expired. Request a new one.', 'OTP_EXPIRED');
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw fail(429, 'Too many attempts. Request a new code.', 'OTP_ATTEMPTS');
    }
    if (otp.codeHash !== this.hash(code)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw fail(400, 'That code is not correct.', 'OTP_INVALID');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (user?.deletedAt) {
      throw fail(403, 'This account has been deleted.', 'ACCOUNT_DELETED');
    }
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          name: 'Customer',
          consent: { create: { orderUpdates: true, liveAlerts: false, offers: false } },
        },
      });
    }
    return this.tokenFor(user);
  }

  tokenFor(user: User) {
    const expiresIn = 60 * 60 * 24 * 7;
    const accessToken = this.jwt.sign({ sub: user.id, role: user.role }, { expiresIn });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: this.present(user),
    };
  }

  present(user: User) {
    return {
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
      language: user.language,
      preferredBranchId: user.preferredBranchId,
      staffBranchId: user.staffBranchId,
    };
  }

  private hash(code: string) {
    return createHash('sha256').update(`${code}:${process.env.OTP_PEPPER ?? 'dev'}`).digest('hex');
  }
}
