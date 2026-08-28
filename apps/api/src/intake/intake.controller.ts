import {
  AccessLevel,
  ChronicleSource,
  Section,
  intakePayloadSchema,
  type ChronicleDetail,
  type ChronicleEntryCreate,
  type ChronicleMetadata,
  type IntakeAddress,
} from '@cairn/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AccessService } from '../access/access.service';
import type { RequestSubject } from '../access/access.types';
import { SuperadminGuard } from '../access/superadmin.guard';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ChronicleService } from '../chronicle/chronicle.service';
import { IntakeService } from './intake.service';

/** Управление приёмным адресом проекта (спека 5.2). */
@Controller('projects/:projectId/intake-address')
export class IntakeAddressController {
  constructor(
    private readonly intake: IntakeService,
    private readonly access: AccessService,
  ) {}

  /**
   * Показывает адрес пишущим в хронику: им и пересылать сводки.
   *
   * Право проверяется явно через `requireLevel`: данных секции маршрут
   * не отдаёт, поэтому репозиторий секции здесь ни при чём.
   */
  @Get()
  @UseGuards(SessionGuard)
  async find(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<IntakeAddress> {
    await this.access.requireLevel(subject, projectId, Section.Chronicle, AccessLevel.Write);

    const token = await this.intake.findAddress(projectId);

    if (!token) {
      throw new NotFoundException('У проекта нет приёмного адреса');
    }

    return addressForms(token);
  }

  /** Создаёт адрес. Управление субъектами — право суперадмина. */
  @Post()
  @UseGuards(SessionGuard, SuperadminGuard)
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<IntakeAddress> {
    return addressForms(await this.intake.createAddress(subject, projectId));
  }

  /** Отзывает адрес: старые интеграции гаснут явно. */
  @Delete()
  @HttpCode(204)
  @UseGuards(SessionGuard, SuperadminGuard)
  async revoke(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<void> {
    await this.intake.revokeAddress(subject, projectId);
  }
}

/** Приём входящих: единственный маршрут записи без сессии (спека 5.1). */
@Controller('intake')
export class IntakeController {
  constructor(
    private readonly intake: IntakeService,
    private readonly chronicle: ChronicleService,
  ) {}

  /** Принимает сводку по адресу проекта и кладёт её в хронику. */
  @Post(':token')
  async receive(
    @Param('token') token: string,
    @Body() body: unknown,
  ): Promise<ChronicleMetadata | ChronicleDetail> {
    const resolved = await this.intake.resolveToken(token);

    if (!resolved) {
      // Мусорный и отозванный токены неразличимы (спека 3.2).
      throw new NotFoundException();
    }

    const created = await this.chronicle.create(
      resolved.subject,
      resolved.projectId,
      normalizePayload(body),
      ChronicleSource.Webhook,
    );

    return this.chronicle.findById(resolved.subject, resolved.projectId, created.id);
  }
}

/**
 * Приводит тело запроса к данным записи: JSON или чистый текст.
 *
 * Разбор здесь, а не в `ZodValidationPipe`: тело разнородное, и текст
 * без JSON — законный вход, а не ошибка формата.
 */
function normalizePayload(body: unknown): ChronicleEntryCreate {
  const raw = typeof body === 'string' ? { content: body.trim() } : parseJsonPayload(body);

  if (!raw.content) {
    throw new BadRequestException('Содержимое не должно быть пустым');
  }

  return {
    content: raw.content,
    // Заголовок — первая строка содержимого: у пересланной сводки
    // отдельного заголовка обычно нет.
    title: ('title' in raw ? raw.title : undefined) ?? firstLineOf(raw.content),
    occurredOn: ('occurredOn' in raw ? raw.occurredOn : undefined) ?? todayIso(),
  };
}

/** Разбирает JSON-тело; непонятное превращает в понятный отказ. */
function parseJsonPayload(body: unknown): { title?: string; content: string; occurredOn?: string } {
  const parsed = intakePayloadSchema.safeParse(body);

  if (!parsed.success) {
    throw new BadRequestException(
      'Ожидается JSON с полем content либо тело text/plain со сводкой',
    );
  }

  return parsed.data;
}

/** Первая непустая строка, обрезанная до длины заголовка. */
function firstLineOf(content: string): string {
  return (content.split('\n').find((line) => line.trim()) ?? 'Входящее').trim().slice(0, 300);
}

/** Сегодняшняя дата в формате ISO. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Обе формы адреса из токена (спека 5.2: одна строка — два канала). */
function addressForms(token: string): IntakeAddress {
  const base = process.env.CAIRN_WEB_URL ?? 'http://localhost:3000';
  const host = new URL(base).hostname;

  return {
    token,
    webhookUrl: `${base}/api/intake/${token}`,
    emailAddress: `${token}@intake.${host}`,
  };
}
