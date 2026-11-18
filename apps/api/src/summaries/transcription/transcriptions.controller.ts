import {
  RECORDING_TYPE_NOT_ACCEPTED,
  UPLOAD_TYPES,
  transcriptionRequestSchema,
  type TranscriptionJob,
  type TranscriptionRequest,
} from '@cairn/shared';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { RequestSubject } from '../../access/access.types';
import { CurrentSubject } from '../../auth/current-subject.decorator';
import { SessionGuard } from '../../auth/session.guard';
import { TranscriptionService } from './transcription.service';

/**
 * Ручки расшифровки записи созвона (дизайн, 5.1).
 *
 * Живёт в том же модуле и на том же префиксе, что саммари, и это важно для
 * **порядка регистрации**: `GET /transcriptions` и `GET /:id` различаются
 * только тем, кто из них объявлен раньше, и этот контроллер обязан стоять в
 * `controllers` модуля **перед** `SummariesController`. Иначе очередь
 * попадала бы в маршрут саммари и отвечала `400` про негодный UUID.
 *
 * Guard'а уровня нет: уровень проверяет репозиторий, как в
 * `summaries.controller.ts`. Право то же, что на создание саммари —
 * `Chronicle ≥ write`, новой единицы выдачи доступа не появилось.
 */
@Controller('projects/:projectId/summaries')
@UseGuards(SessionGuard)
export class TranscriptionsController {
  constructor(private readonly transcriptions: TranscriptionService) {}

  /**
   * Принимает запись сырым телом, паспорт — строкой запроса.
   *
   * `202`, а не `201`: создана **задача**, а результат будет позже; `201`
   * обещал бы готовую сущность.
   *
   * Тело не проходит через разборщик и достаётся контроллеру потоком:
   * `express.json()` и `urlencoded()` стоят на своих типах содержимого, а
   * `text({ type: 'text/plain' })` — на своём, и медиа-типов не касается
   * никто. Поэтому `main.ts` **не правится вовсе**, и это лучше, чем
   * правится: чем меньше глобальных разборщиков, тем меньше мест, где
   * следующий поток случайно съест чужое тело (дизайн, 5.2).
   */
  @Post('transcriptions')
  @HttpCode(202)
  accept(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<TranscriptionJob> {
    return this.transcriptions.accept(subject, projectId, this.passportOf(query), request);
  }

  /** Очередь проекта: незакрытые и неудавшиеся задачи. */
  @Get('transcriptions')
  queue(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<TranscriptionJob[]> {
    return this.transcriptions.queue(subject, projectId);
  }

  /** Удаляет задачу вместе с её файлами. */
  @Delete('transcriptions/:jobId')
  @HttpCode(204)
  remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<void> {
    return this.transcriptions.remove(subject, projectId, jobId);
  }

  /** Отменяет задачу: строка закрывается, провайдеру уходит `forget`. */
  @Post('transcriptions/:jobId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<TranscriptionJob> {
    return this.transcriptions.cancel(subject, projectId, jobId);
  }

  /** Расшифровывает запись саммари снова: паспорт не нужен, он уже есть. */
  @Post(':summaryId/transcriptions')
  @HttpCode(202)
  retry(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('summaryId', ParseUUIDPipe) summaryId: string,
  ): Promise<TranscriptionJob> {
    return this.transcriptions.retry(subject, projectId, summaryId);
  }

  /**
   * Отдаёт дорожку потоком с поддержкой перемотки.
   *
   * `res.sendFile` ставит `Accept-Ranges` и отвечает `206` сам — своего
   * разбора `Range` писать не нужно, а без перемотки `<audio>` не умеет
   * переслушать спорное место.
   *
   * `Content-Disposition: inline` **без** `filename`: имени присланного
   * файла у нас нет вовсе, а выдумывать его — значит выдумывать.
   */
  @Get(':summaryId/recording')
  async recording(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('summaryId', ParseUUIDPipe) summaryId: string,
    @Res() response: Response,
  ): Promise<void> {
    const recording = await this.transcriptions.recordingOf(subject, projectId, summaryId);

    response.type(recording.mediaType);
    response.setHeader('Content-Disposition', 'inline');
    response.sendFile(recording.path);
  }

  /**
   * Паспорт из строки запроса либо названный отказ.
   *
   * Разбор здесь, а не `ZodValidationPipe`, по одной причине: непринимаемый
   * контейнер обязан получить `415` с перечнем принимаемых, а пипа отдала
   * бы `400` «ошибка схемы» — то есть «вы прислали чепуху» там, где правда
   * другая: формат назван верно, его просто не принимают. Остальные
   * нарушения схемы остаются `400` и в том же виде, что у пипы.
   */
  private passportOf(query: Record<string, unknown>): TranscriptionRequest {
    const parsed = transcriptionRequestSchema.safeParse(query);

    if (parsed.success) {
      return parsed.data;
    }

    if (!(UPLOAD_TYPES as readonly string[]).includes(String(query.uploadType))) {
      throw new UnsupportedMediaTypeException({
        code: RECORDING_TYPE_NOT_ACCEPTED,
        // Список считает сервер: своя копия в браузере разошлась бы с ним
        // на первой же установке без `ffmpeg`.
        acceptedTypes: this.transcriptions.uploadTypesOf(),
        message: 'Такой контейнер загрузка не принимает.',
      });
    }

    throw new BadRequestException({
      message: 'Неверные данные запроса',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    });
  }
}
