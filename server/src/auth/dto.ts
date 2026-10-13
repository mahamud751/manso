import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '+8801712345678', description: 'Bangladesh mobile. 01…, 8801… and +8801… are accepted.' })
  @IsString()
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+8801712345678' })
  @IsString()
  phone!: string;

  @ApiProperty({ example: '482613', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class AuthTokenDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ description: 'Seconds until the session expires.' })
  expiresIn!: number;

  @ApiProperty()
  user!: Record<string, unknown>;
}

export class OtpRequestedDto {
  @ApiProperty({ example: '+8801712345678' })
  phone!: string;

  @ApiProperty({ example: 300 })
  expiresInSeconds!: number;

  @ApiProperty({ example: 60 })
  resendAfterSeconds!: number;

  @ApiPropertyOptional({
    description: 'Present only when OTP_DEBUG=true. Never enable this in production.',
    example: '482613',
  })
  debugCode?: string;
}
