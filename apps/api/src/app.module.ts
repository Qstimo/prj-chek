import { Module } from '@nestjs/common';

import { AccessModule } from './access/access.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CryptoModule } from './crypto/crypto.module';
import { DbModule } from './db/db.module';
import { EnvironmentsModule } from './environments/environments.module';
import { GrantsModule } from './grants/grants.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';

/** Корневой модуль приложения. */
@Module({
  imports: [
    DbModule,
    CryptoModule,
    AuditModule,
    AccessModule,
    AuthModule,
    ProjectsModule,
    EnvironmentsModule,
    GrantsModule,
    InvitationsModule,
    UsersModule,
  ],
})
export class AppModule {}
