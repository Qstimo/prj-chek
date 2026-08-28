import { AuditSubjectKind } from '@cairn/shared';
import { Controller, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { ChronicleRepository } from '../chronicle/chronicle.repository';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { DocsRepository } from '../docs/docs.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { StatusRepository } from '../status/status.repository';
import { VariablesRepository } from '../variables/variables.repository';
import { VariablesService } from '../variables/variables.service';
import { AgentTokensService } from './agent-tokens.service';
import { registerTools } from './mcp-tools';

/**
 * MCP-сервер (ТЗ 7.2): агенты подключаются адресом и токеном.
 *
 * Stateless-режим: каждый запрос самодостаточен, состояние сессий SDK
 * не хранится — обработчик совместим с несколькими экземплярами API.
 * Каждый вызов инструмента пишется в журнал с пометкой машинного
 * доступа (ТЗ 7.4).
 */
@Controller('mcp')
export class McpController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tokens: AgentTokensService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsRepository,
    private readonly docs: DocsRepository,
    private readonly roadmap: RoadmapRepository,
    private readonly chronicle: ChronicleRepository,
    private readonly variables: VariablesRepository,
    private readonly variablesService: VariablesService,
    private readonly status: StatusRepository,
  ) {}

  /** Обрабатывает JSON-RPC запрос MCP. */
  @Post()
  async handle(@Req() request: Request, @Res() response: Response): Promise<void> {
    const bearer = request.get('authorization');
    const token = bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : null;
    const resolved = token ? await this.tokens.authenticate(token) : null;

    if (!resolved) {
      throw new UnauthorizedException('Нужен действующий токен агента');
    }

    const server = new McpServer({ name: 'cairn', version: '1.0.0' });

    registerTools(
      server,
      {
        projects: this.projects,
        docs: this.docs,
        roadmap: this.roadmap,
        chronicle: this.chronicle,
        variables: this.variables,
        variablesService: this.variablesService,
        status: this.status,
      },
      {
        subject: resolved.subject,
        projectId: resolved.projectId,
        canRevealVariables: resolved.canRevealVariables,
        recordCall: async (tool, args) => {
          // ТЗ 7.4: все запросы агента — в общий журнал с пометкой машины.
          await this.db.transaction(async (tx) => {
            await this.audit.record(
              tx,
              {
                kind: AuditSubjectKind.AgentToken,
                id: resolved.subject.id,
                label: resolved.subject.label,
              },
              {
                action: AuditAction.AgentToolCalled,
                entityType: 'mcp_tool',
                projectId: resolved.projectId,
                metadata: { tool, args },
              },
            );
          });
        },
      },
    );

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    response.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  }
}
