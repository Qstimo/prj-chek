import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../crypto/crypto.module';
import { DbModule } from '../db/db.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { CliCommands } from './commands';

/**
 * Модуль команд консоли. Контроллеров не имеет: HTTP здесь не поднимается.
 *
 * `AuthModule` намеренно не импортирован: он объявляет `AuthService`,
 * `TotpService` и `SessionGuard`, которым не нужен ни один из них здесь,
 * а их зависимости выведены из типов параметров конструктора — под `tsx`
 * (esbuild не эмитит `design:paramtypes`) это ломает резолвинг DI. Нужные
 * команде `PasswordService` и `SessionsRepository` `InvitationsModule`
 * уже экспортирует.
 */
@Module({
  imports: [DbModule, CryptoModule, AuditModule, InvitationsModule],
  providers: [CliCommands],
  exports: [CliCommands],
})
export class CliModule {}
