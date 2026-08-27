import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { CryptoModule } from '../crypto/crypto.module';
import { DbModule } from '../db/db.module';
import { InvitationsService } from '../invitations/invitations.service';
import { CliCommands } from './commands';

/**
 * Модуль команд консоли. Контроллеров не имеет: HTTP здесь не поднимается.
 *
 * `AuthModule` намеренно не импортирован: он объявляет `AuthService`,
 * `TotpService` и `SessionGuard`, которым не нужен ни один из них здесь,
 * а их зависимости выведены из типов параметров конструктора — под `tsx`
 * (esbuild не эмитит `design:paramtypes`) это ломает резолвинг DI.
 *
 * `InvitationsModule` тоже не импортирован, хотя `InvitationsService`
 * нужен: с появлением контроллера приглашений тот модуль сам стал тянуть
 * `AuthModule` (нужен `SessionGuard`), а значит и его самого сюда пускать
 * нельзя. `PasswordService`, `SessionsRepository` и `InvitationsService`
 * объявлены здесь напрямую — все их зависимости резолвятся по явному
 * токену `@Inject`, поэтому это безопасно для `tsx`.
 */
@Module({
  imports: [DbModule, CryptoModule, AuditModule],
  providers: [PasswordService, SessionsRepository, InvitationsService, CliCommands],
  exports: [CliCommands],
})
export class CliModule {}
