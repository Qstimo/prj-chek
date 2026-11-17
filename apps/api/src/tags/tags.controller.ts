import { tagSetSchema, type Tag, type TagSet } from '@cairn/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TagsService } from './tags.service';

/**
 * Словарь тегов: что встречается в видимых субъекту паспортах.
 *
 * Отдельный маршрут от набора у проекта, потому что отвечает на другой
 * вопрос: не «чем помечен этот проект», а «какими словами здесь вообще
 * помечают». Нужен подсказкам в форме — без общего словаря свободные
 * теги расходятся на «Web» и «Вэб».
 *
 * Своего права у реестра нет: он раскрывается ровно в той мере, в какой
 * видны паспорта.
 */
@Controller('tags')
@UseGuards(SessionGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  /** Теги видимых паспортов, по алфавиту. */
  @Get()
  async vocabulary(@CurrentSubject() subject: RequestSubject): Promise<Tag[]> {
    return this.tags.vocabulary(subject);
  }
}

/** Теги проекта: поле паспорта, секция «Инфо». */
@Controller('projects/:projectId/tags')
@UseGuards(SessionGuard)
export class ProjectTagsController {
  constructor(private readonly tags: TagsService) {}

  /**
   * Заменяет набор целиком.
   *
   * `PUT`, а не `POST`/`DELETE` по тегу: за тегом ничего не стоит, и
   * набор правится одной формой. Пустой список снимает все теги.
   */
  @Put()
  async set(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(tagSetSchema)) body: TagSet,
  ): Promise<Tag[]> {
    return this.tags.set(subject, projectId, body.labels);
  }
}
