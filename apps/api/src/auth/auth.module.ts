import { forwardRef, Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../crypto/crypto.module';
import { DbModule } from '../db/db.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionGuard } from './session.guard';
import { SessionsRepository } from './sessions.repository';
import { TotpService } from './totp.service';

/**
 * Модуль аутентификации.
 *
 * Связь с модулем журнала взаимная: см. комментарий в `AuditModule`.
 */
@Module({
  imports: [DbModule, CryptoModule, forwardRef(() => AuditModule)],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TotpService,
    SessionsRepository,
    LoginAttemptsService,
    SessionGuard,
  ],
  exports: [SessionGuard, SessionsRepository, PasswordService, TotpService],
})
export class AuthModule {}
