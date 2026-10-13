import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http';

loadEnv();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix('v1');
  app.enableCors();
  app.useStaticAssets(join(process.cwd(), 'public'));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const documentConfig = new DocumentBuilder()
    .setTitle('Manso API')
    .setDescription(
      [
        'Customer, branch and driver API for Manso Fresh Meat.',
        '',
        'Money is integer poisha (1 BDT = 100 poisha). Weights are integer grams.',
        'Operating times are Asia/Dhaka. Timestamps are UTC.',
        'Prices and stock on customer responses are server authoritative.',
        '',
        'Authenticate with Authorization: Bearer from POST /v1/auth/verify.',
        'Mutating checkout uses an Idempotency-Key header.',
        'Payment webhooks require X-Manso-Signature, the hex HMAC-SHA256 of the raw body.',
        '',
        'Error body: { statusCode, message, code, errors? }.',
        'Codes include PHONE_INVALID, OTP_INVALID, OTP_EXPIRED, STOCK_CONFLICT, QUOTE_EXPIRED, SLOT_UNAVAILABLE, SLOT_FULL, MIN_ORDER, AMOUNT_MISMATCH, SIGNATURE_INVALID, FORBIDDEN_TRANSITION, BRANCH_FORBIDDEN, CODE_INVALID, WRONG_BRANCH.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('http://localhost:3000')
    .build();
  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
  if (process.env.WRITE_OPENAPI === 'true') {
    writeFileSync(join(process.cwd(), 'openapi.json'), JSON.stringify(document, null, 2));
    await app.close();
    return;
  }
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap();
