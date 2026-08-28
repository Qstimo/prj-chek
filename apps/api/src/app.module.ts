import { Module } from '@nestjs/common';

import { AccessModule } from './access/access.module';
import { AgentsModule } from './agents/agents.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ChronicleModule } from './chronicle/chronicle.module';
import { CryptoModule } from './crypto/crypto.module';
import { DbModule } from './db/db.module';
import { DocsModule } from './docs/docs.module';
import { EnvironmentsModule } from './environments/environments.module';
import { GrantsModule } from './grants/grants.module';
import { IntakeModule } from './intake/intake.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ProjectsModule } from './projects/projects.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { StatusModule } from './status/status.module';
import { UsersModule } from './users/users.module';
import { VariablesModule } from './variables/variables.module';

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
    ChronicleModule,
    VariablesModule,
    RoadmapModule,
    DocsModule,
    StatusModule,
    IntakeModule,
    AgentsModule,
    GrantsModule,
    InvitationsModule,
    UsersModule,
  ],
})
export class AppModule {}
