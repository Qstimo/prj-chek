import { Module } from '@nestjs/common';

import { AccessModule } from './access/access.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CryptoModule } from './crypto/crypto.module';
import { DbModule } from './db/db.module';

/** Корневой модуль приложения. */
@Module({
  imports: [DbModule, CryptoModule, AuditModule, AccessModule, AuthModule],
})
export class AppModule {}
