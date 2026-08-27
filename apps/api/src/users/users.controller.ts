import type { UserRow } from '@cairn/shared';
import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { SuperadminGuard } from '../access/superadmin.guard';
import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { InvitationsService } from '../invitations/invitations.service';
import { UsersService } from './users.service';
import { buildInviteUrl, type IssuedLinkResponse } from './invite-url';

/** Управление пользователями. Доступно только суперадмину (спека 8). */
@Controller('users')
@UseGuards(SessionGuard, SuperadminGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly invitations: InvitationsService,
  ) {}

  /** Список пользователей. */
  @Get()
  async list(): Promise<UserRow[]> {
    return this.users.list();
  }

  /** Отзывает доступ пользователю и завершает его сессии. */
  @Post(':id/revoke')
  @HttpCode(204)
  async revoke(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.revoke({ id: subject.id, label: subject.label }, id);
  }

  /** Снимает отзыв. */
  @Post(':id/restore')
  @HttpCode(204)
  async restore(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.restore({ id: subject.id, label: subject.label }, id);
  }

  /** Снимает привязку второго фактора. */
  @Post(':id/reset-totp')
  @HttpCode(204)
  async resetTotp(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.resetTotp({ id: subject.id, label: subject.label }, id);
  }

  /**
   * Сбрасывает пароль и возвращает одноразовую ссылку.
   *
   * Ссылка показывается суперадмину один раз: почты на этапе 1 нет,
   * передача ссылки — его забота (спека 6.7).
   */
  @Post(':id/reset-password')
  async resetPassword(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IssuedLinkResponse> {
    const link = await this.invitations.resetPassword(
      { id: subject.id, label: subject.label, userId: await this.users.userIdOfSubject(subject.id) },
      id,
    );

    return buildInviteUrl(link);
  }
}
