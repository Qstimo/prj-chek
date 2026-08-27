import {
  loginSchema,
  totpConfirmSchema,
  totpVerifySchema,
  type CurrentSubjectResponse,
  type LoginResponse,
  type TotpConfirmInput,
  type TotpSetupResponse,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { RequestSubject } from '../access/access.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentSubject } from './current-subject.decorator';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from './session.cookie';
import { SessionGuard } from './session.guard';
import { SessionsRepository } from './sessions.repository';

/** Вход, выход и второй фактор (спека 8). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsRepository,
  ) {}

  /**
   * Первый шаг входа.
   *
   * Возвращает либо признак выданной сессии, либо челлендж второго фактора.
   * Сама сессия уходит в cookie, а не в тело ответа: токен не должен быть
   * доступен скриптам страницы.
   */
  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: { email: string; password: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const outcome = await this.auth.login(body.email, body.password, originOf(request));

    if (outcome.kind === 'session') {
      response.cookie(SESSION_COOKIE, outcome.token, SESSION_COOKIE_OPTIONS);

      return { kind: 'session' };
    }

    return { kind: 'totp_required', challengeToken: outcome.challengeToken };
  }

  /** Второй шаг входа: обмен челленджа и кода на сессию. */
  @Post('totp')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(totpVerifySchema))
  async verifyTotp(
    @Body() body: { challengeToken: string; code: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ kind: 'session' }> {
    const token = await this.auth.verifyTotp(body.challengeToken, body.code, originOf(request));

    response.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

    return { kind: 'session' };
  }

  /** Начинает привязку второго фактора. */
  @Post('totp/setup')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async setupTotp(@CurrentSubject() subject: RequestSubject): Promise<TotpSetupResponse> {
    return this.auth.setupTotp(subject);
  }

  /** Подтверждает привязку второго фактора. */
  @Post('totp/confirm')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async confirmTotp(
    @CurrentSubject() subject: RequestSubject,
    @Body(new ZodValidationPipe(totpConfirmSchema)) body: TotpConfirmInput,
  ): Promise<void> {
    await this.auth.confirmTotp(subject, body.code);
  }

  /** Выход: отзыв сессии и удаление cookie. */
  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = request.cookies?.[SESSION_COOKIE];

    if (token) {
      await this.sessions.revoke(this.sessions.connection, token);
    }

    response.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
  }

  /** Текущий пользователь. */
  @Get('me')
  @UseGuards(SessionGuard)
  async me(@CurrentSubject() subject: RequestSubject): Promise<CurrentSubjectResponse> {
    return this.auth.describeSubject(subject);
  }
}

/** Достаёт источник запроса для записи в сессию. */
function originOf(request: Request): { ip?: string; userAgent?: string } {
  return { ip: request.ip, userAgent: request.get('user-agent') ?? undefined };
}
