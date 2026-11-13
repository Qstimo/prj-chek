import {
  pushCheckSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  type PushCheckRequest,
  type PushCheckResponse,
  type PushKeyResponse,
  type PushSubscribeRequest,
  type PushUnsubscribeRequest,
} from '@cairn/shared';
import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PushService } from './push.service';

/** Веб-пуши: публичный ключ и подписки устройств. */
@Controller('push')
@UseGuards(SessionGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Публичный VAPID-ключ. Ручкой, а не вшитым в сборку значением. */
  @Get('key')
  key(): PushKeyResponse {
    return this.push.publicKey();
  }

  /** Заводит подписку этого устройства. */
  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(pushSubscribeSchema)) body: PushSubscribeRequest,
  ): Promise<void> {
    await this.push.subscribe(subject, body);
  }

  /**
   * Числится ли адрес за этим субъектом.
   *
   * `POST` на чтение намеренно: адрес подписки не должен попадать ни в
   * URL, ни в логи обращений — то же правило, что у снятия.
   */
  @Post('subscriptions/status')
  @HttpCode(200)
  async status(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(pushCheckSchema)) body: PushCheckRequest,
  ): Promise<PushCheckResponse> {
    return { isMine: await this.push.isMine(subject, body.endpoint) };
  }

  /** Снимает подписку этого устройства. Адрес в теле, не в URL. */
  @Delete('subscriptions')
  @HttpCode(204)
  async unsubscribe(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: PushUnsubscribeRequest,
  ): Promise<void> {
    await this.push.unsubscribe(subject, body.endpoint);
  }
}
