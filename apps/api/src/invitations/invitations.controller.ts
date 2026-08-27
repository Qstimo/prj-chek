import {
  acceptInvitationSchema,
  inviteUserSchema,
  type AcceptInvitationInput,
  type InviteUserInput,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { SuperadminGuard } from '../access/superadmin.guard';
import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '../auth/session.cookie';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { buildInviteUrl, type IssuedLinkResponse } from '../users/invite-url';
import { UsersService } from '../users/users.service';
import { InvitationsService } from './invitations.service';

/** Приглашения и установка пароля по ссылке (спека 8). */
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly users: UsersService,
  ) {}

  /** Приглашает пользователя. Доступно только суперадмину. */
  @Post()
  @UseGuards(SessionGuard, SuperadminGuard)
  async invite(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput,
  ): Promise<IssuedLinkResponse> {
    const userId = await this.users.userIdOfSubject(subject.id);
    const link = await this.invitations.invite(
      { id: subject.id, label: subject.label, userId },
      body.email,
    );

    return buildInviteUrl(link);
  }

  /**
   * Проверяет действительность ссылки.
   *
   * Доступен без сессии: человек по ссылке ещё не вошёл. Ответ не содержит
   * ничего, кроме признака пригодности и вида ссылки, — иначе перебор
   * токенов раскрывал бы состав пользователей.
   */
  @Get(':token')
  async check(@Param('token') token: string): Promise<{ kind: string }> {
    const link = await this.invitations.findUsableLink(token);

    if (!link) {
      throw new NotFoundException('Ссылка недействительна или уже использована');
    }

    return { kind: link.kind };
  }

  /**
   * Устанавливает пароль по ссылке.
   *
   * Если у пользователя привязан второй фактор, сессия не выдаётся:
   * вход завершается обычным челленджем, и ссылка не даёт его обойти (спека 4.6).
   */
  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ kind: 'session' } | { kind: 'totp_required' }> {
    const { sessionToken } = await this.invitations.acceptLink(token, body.password, {});

    if (!sessionToken) {
      return { kind: 'totp_required' };
    }

    response.cookie(SESSION_COOKIE, sessionToken, SESSION_COOKIE_OPTIONS);

    return { kind: 'session' };
  }
}
