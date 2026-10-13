import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Language, User } from '@prisma/client';
import { JwtAuthGuard, fail } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';

class ProfileDto {
  @ApiProperty({ required: false, example: 'Customer' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ required: false, enum: ['EN', 'BN'] })
  @IsOptional()
  @IsIn(['EN', 'BN'])
  language?: Language;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  preferredBranchId?: string;
}

class AddressDto {
  @ApiProperty({ example: 'Home' })
  @IsString()
  label!: string;

  @ApiProperty({ example: 'House 12, Road 4' })
  @IsString()
  line1!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  line2?: string;

  @ApiProperty({ example: 'Uposhahar' })
  @IsString()
  area!: string;

  @ApiProperty({ example: 'Sylhet' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false, example: '3100' })
  @IsOptional()
  @IsString()
  postcode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

class ConsentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  liveAlerts?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  offers?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  orderUpdates?: boolean;
}

class DeviceDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ example: 'ios' })
  @IsString()
  platform!: string;
}

@ApiTags('Account')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch('account')
  @ApiOperation({ summary: 'Update name, language or preferred branch' })
  async update(@Req() req: { user: User }, @Body() body: ProfileDto) {
    if (body.preferredBranchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: body.preferredBranchId, active: true } });
      if (!branch) throw fail(404, 'Branch not found.', 'BRANCH_NOT_FOUND');
    }
    const user = await this.prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: body.name?.trim() || undefined,
        language: body.language,
        preferredBranchId: body.preferredBranchId,
      },
    });
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      language: user.language,
      preferredBranchId: user.preferredBranchId,
      role: user.role,
    };
  }

  @Get('addresses')
  @ApiOperation({ summary: 'Saved addresses' })
  addresses(@Req() req: { user: User }) {
    return this.prisma.address.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
  }

  @Post('addresses')
  @ApiOperation({ summary: 'Add an address' })
  async addAddress(@Req() req: { user: User }, @Body() body: AddressDto) {
    if (body.isDefault) {
      await this.prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    }
    return this.prisma.address.create({
      data: {
        userId: req.user.id,
        label: body.label,
        line1: body.line1,
        line2: body.line2,
        area: body.area,
        city: body.city || 'Sylhet',
        postcode: body.postcode,
        isDefault: body.isDefault ?? true,
      },
    });
  }

  @Patch('addresses/:id')
  @ApiOperation({ summary: 'Edit an address' })
  async editAddress(@Req() req: { user: User }, @Param('id') id: string, @Body() body: AddressDto) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) throw fail(404, 'Address not found.', 'ADDRESS_NOT_FOUND');
    if (body.isDefault) {
      await this.prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    }
    return this.prisma.address.update({
      where: { id },
      data: {
        label: body.label,
        line1: body.line1,
        line2: body.line2,
        area: body.area,
        city: body.city || existing.city,
        postcode: body.postcode,
        isDefault: body.isDefault ?? existing.isDefault,
      },
    });
  }

  @Delete('addresses/:id')
  @ApiOperation({ summary: 'Remove an address' })
  async removeAddress(@Req() req: { user: User }, @Param('id') id: string) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) throw fail(404, 'Address not found.', 'ADDRESS_NOT_FOUND');
    await this.prisma.address.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('consents')
  @ApiOperation({ summary: 'Notification and policy consent' })
  async consents(@Req() req: { user: User }) {
    return this.prisma.consent.upsert({
      where: { userId: req.user.id },
      update: {},
      create: { userId: req.user.id },
    });
  }

  @Patch('consents')
  @ApiOperation({
    summary: 'Update live alerts, offers and order updates independently',
    description: 'Live alerts are off until the customer opts in. Order updates default to on.',
  })
  async updateConsents(@Req() req: { user: User }, @Body() body: ConsentDto) {
    return this.prisma.consent.upsert({
      where: { userId: req.user.id },
      update: body,
      create: { userId: req.user.id, ...body },
    });
  }

  @Post('account/delete')
  @ApiOperation({
    summary: 'Delete the account',
    description: 'Personal profile is anonymised. Orders and payments are retained for reconciliation.',
  })
  async remove(@Req() req: { user: User }) {
    await this.prisma.user.update({
      where: { id: req.user.id },
      data: {
        deletedAt: new Date(),
        name: 'Deleted customer',
        phone: null,
        preferredBranchId: null,
      },
    });
    await this.prisma.deviceToken.deleteMany({ where: { userId: req.user.id } });
    await this.prisma.address.deleteMany({ where: { userId: req.user.id } });
    return { deleted: true, retained: ['orders', 'payments', 'refunds'] };
  }

  @Post('devices')
  @ApiOperation({ summary: 'Register a push token. Delivery itself uses the in-app inbox until FCM is configured.' })
  device(@Req() req: { user: User }, @Body() body: DeviceDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: body.token },
      update: { userId: req.user.id, platform: body.platform },
      create: { userId: req.user.id, token: body.token, platform: body.platform },
    });
  }
}

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'In-app notification inbox' })
  async list(@Req() req: { user: User }) {
    const items = await this.prisma.notificationEvent.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return items.map((item) => ({
      id: item.id,
      type: item.type,
      title: { en: item.titleEn, bn: item.titleBn },
      body: { en: item.bodyEn, bn: item.bodyBn },
      deepLink: item.deepLink,
      sessionId: item.sessionId,
      orderId: item.orderId,
      readAt: item.readAt,
      createdAt: item.createdAt,
    }));
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  async read(@Req() req: { user: User }, @Param('id') id: string) {
    const item = await this.prisma.notificationEvent.findFirst({ where: { id, userId: req.user.id } });
    if (!item) throw fail(404, 'Notification not found.', 'NOTIFICATION_NOT_FOUND');
    return this.prisma.notificationEvent.update({ where: { id }, data: { readAt: new Date() } });
  }
}
