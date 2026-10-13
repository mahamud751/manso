import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/http';
import { LiveService } from './live.service';

class HeartbeatDto {
  @ApiProperty({ description: 'Stable anonymous id stored on the device. Used only to count current viewers.', example: 'device-8f3a1c0e' })
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  viewerKey!: string;
}

class QuestionDto {
  @ApiProperty({ example: 'Can I get the bone-in cut in smaller curry pieces?' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  message!: string;
}

@ApiTags('Live')
@Controller()
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Get('live/sessions')
  @ApiOperation({
    summary: 'Broadcast schedule and current session',
    description: 'Viewer count is the number of heartbeats in the last 90 seconds. It is not a seeded number.',
  })
  @ApiQuery({ name: 'branchId', required: false })
  sessions(@Query('branchId') branchId?: string) {
    return this.live.listSessions(branchId);
  }

  @Get('live/sessions/:id')
  @ApiOperation({ summary: 'Session detail with pinned products from the real batch' })
  session(@Param('id') id: string) {
    return this.live.getSession(id);
  }

  @Post('live/sessions/:id/heartbeat')
  @ApiOperation({ summary: 'Record a viewer heartbeat' })
  heartbeat(@Param('id') id: string, @Body() body: HeartbeatDto) {
    return this.live.heartbeat(id, body.viewerKey);
  }

  @Post('live/sessions/:id/questions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ask a private question about this session' })
  ask(@Param('id') id: string, @Body() body: QuestionDto, @Req() req: { user: User }) {
    return this.live.ask(id, req.user, body.message);
  }

  @Get('live/sessions/:id/questions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Your private questions for this session' })
  questions(@Param('id') id: string, @Req() req: { user: User }) {
    return this.live.myQuestions(id, req.user);
  }

  @Get('replays')
  @ApiOperation({ summary: 'Published replays' })
  @ApiQuery({ name: 'branchId', required: false })
  replays(@Query('branchId') branchId?: string) {
    return this.live.listReplays(branchId);
  }

  @Get('replays/:id')
  @ApiOperation({ summary: 'Replay detail. Sold-out batches are not orderable.' })
  replay(@Param('id') id: string) {
    return this.live.getReplay(id);
  }

  @Post('replays/:id/view')
  @ApiOperation({ summary: 'Count one replay view' })
  view(@Param('id') id: string) {
    return this.live.countView(id);
  }
}
