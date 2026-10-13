import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/http';
import { AuthService } from './auth.service';
import { AuthTokenDto, OtpRequestedDto, RequestOtpDto, VerifyOtpDto } from './dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp')
  @ApiOperation({
    summary: 'Send a one-time code',
    description:
      'Issues a 6-digit code for a Bangladesh mobile number. Codes expire after 5 minutes, allow 5 attempts, and can be requested 5 times per 15 minutes. SMS delivery is not wired in local development; when OTP_DEBUG=true the response includes debugCode.',
  })
  @ApiOkResponse({ type: OtpRequestedDto })
  requestOtp(@Body() body: RequestOtpDto) {
    return this.auth.requestOtp(body.phone);
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Verify a code and open a session',
    description: 'Creates a customer on first successful verification. Returns a bearer token valid for 7 days.',
  })
  @ApiOkResponse({ type: AuthTokenDto })
  verify(@Body() body: VerifyOtpDto) {
    return this.auth.verify(body.phone, body.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current session' })
  me(@Req() req: { user: User }) {
    return this.auth.present(req.user);
  }
}
