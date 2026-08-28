import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChronicleModule } from '../chronicle/chronicle.module';
import { DbModule } from '../db/db.module';
import { DocsModule } from '../docs/docs.module';
import { ProjectsModule } from '../projects/projects.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { StatusModule } from '../status/status.module';
import { VariablesModule } from '../variables/variables.module';
import { AgentTokensController } from './agent-tokens.controller';
import { AgentTokensService } from './agent-tokens.service';
import { McpController } from './mcp.controller';

/** Модуль машинного доступа: токены агентов и MCP-сервер. */
@Module({
  imports: [
    DbModule,
    AccessModule,
    AuditModule,
    AuthModule,
    ProjectsModule,
    DocsModule,
    RoadmapModule,
    ChronicleModule,
    VariablesModule,
    StatusModule,
  ],
  controllers: [AgentTokensController, McpController],
  providers: [AgentTokensService],
  exports: [AgentTokensService],
})
export class AgentsModule {}
