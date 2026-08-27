import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PasswordService } from '../auth/password.service';
import { SessionsRepository } from '../auth/sessions.repository';
import { DbModule } from '../db/db.module';
import { InvitationsService } from './invitations.service';

/**
 * Модуль приглашений и одноразовых ссылок.
 *
 * Контроллеров не имеет: HTTP-слой приглашений добавляется отдельной
 * задачей (спека 4.6). Здесь только сервис, нужный командам консоли
 * и будущему контроллеру.
 *
 * `PasswordService` и `SessionsRepository` объявлены здесь напрямую, а не
 * получены импортом `AuthModule`: тот модуль тянет за собой `AuthService`,
 * `TotpService` и `SessionGuard` с зависимостями, выведенными из типов
 * параметров, — под `tsx` (команды консоли) это ломает резолвинг DI, так как
 * esbuild не эмитит `design:paramtypes`. Обоим сервисам здесь эти зависимости
 * не нужны.
 */
@Module({
  imports: [DbModule, AuditModule],
  providers: [PasswordService, SessionsRepository, InvitationsService],
  exports: [InvitationsService, PasswordService, SessionsRepository],
})
export class InvitationsModule {}
