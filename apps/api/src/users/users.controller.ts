import { userUpdateSchema, type UserRow, type UserUpdate } from '@cairn/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { SuperadminGuard } from '../access/superadmin.guard';
import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
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

  /** Паспорт одного пользователя. */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<UserRow> {
    return this.users.findById(id);
  }

  /** Правит имя и почту. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) body: UserUpdate,
  ): Promise<UserRow> {
    return this.users.update({ id: subject.id, label: subject.label }, id, body);
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
