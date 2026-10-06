// apps/api/src/modules/diary/diary.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { DiaryService, type UpsertDiaryDto } from './diary.service.js';
import { EVA_STRUCTURED_REFLECTION_V1 } from '../../common/feature-flags.js';
import { parseLimit, parseOffset } from '../../common/pagination.js';

@Controller('diary')
@UseGuards(AuthGuard)
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upsert(@Request() req: { user: { id: string } }, @Body() dto: UpsertDiaryDto) {
    if (EVA_STRUCTURED_REFLECTION_V1) {
      throw new HttpException(
        'Legacy diary write is deprecated. Use POST /captures instead.',
        HttpStatus.GONE,
      );
    }
    return this.diaryService.upsertDiary(req.user.id, dto);
  }

  @Get('recent')
  async recent(
    @Request() req: { user: { id: string } },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.diaryService.getRecentDiaries(req.user.id, parseLimit(limit, 7), parseOffset(offset));
  }
}
