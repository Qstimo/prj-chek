import { forwardRef, Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { UsersModule } from '../users/users.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

/**
 * Модуль приглашений.
 *
 * Связь с модулем пользователей взаимная: контроллер приглашений находит
 * запись приглашающего, а контроллер пользователей выдаёт ссылку сброса.
 * Разрывается `forwardRef`.
 *
 * `PasswordService` и `SessionsRepository` больше не объявлены здесь
 * напрямую: контроллеру нужен `SessionGuard`, а получить только его без
 * всего `AuthModule` нельзя — приходится импортировать модуль целиком, как
 * это уже делают `ProjectsModule` и `GrantsModule`. Из-за этого модуль
 * перестал быть безопасным для команд консоли, запускаемых через `tsx`:
 * они больше не импортируют его напрямую (см. `cli.module.ts`).
 */
@Module({
  imports: [DbModule, AccessModule, AuthModule, forwardRef(() => UsersModule)],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
