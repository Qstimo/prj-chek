import {
  agentTokenCreateSchema,
  agentTokenUpdateSchema,
  type AgentToken,
  type AgentTokenCreate,
  type AgentTokenCreated,
  type AgentTokenUpdate,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { SuperadminGuard } from '../access/superadmin.guard';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AgentTokensService } from './agent-tokens.service';

/**
 * Управление токенами агентов (ТЗ 7.4).
 *
 * Весь контроллер закрыт guard'ом суперадмина: выпуск машинного
 * субъекта — управление доступами, как выдачи и приглашения.
 */
@Controller('projects/:projectId/agent-tokens')
@UseGuards(SessionGuard, SuperadminGuard)
export class AgentTokensController {
  constructor(private readonly tokens: AgentTokensService) {}

  /** Токены проекта без открытых значений. */
  @Get()
  async list(@Param('projectId', ParseUUIDPipe) projectId: string): Promise<AgentToken[]> {
    return this.tokens.list(projectId);
  }

  /** Создаёт токен. Открытое значение — в ответе, единственный раз. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(agentTokenCreateSchema)) body: AgentTokenCreate,
  ): Promise<AgentTokenCreated> {
    const { row, token } = await this.tokens.create(
      subject,
      projectId,
      body as Required<AgentTokenCreate>,
    );

    return {
      id: row.id,
      label: row.label,
      canRevealVariables: row.canRevealVariables,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: null,
      token,
      mcpUrl: `${process.env.CAIRN_WEB_URL ?? 'http://localhost:3000'}/api/mcp`,
    };
  }

  /** Переключает доступ к значениям переменных. */
  @Patch(':tokenId')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Body(new ZodValidationPipe(agentTokenUpdateSchema)) body: AgentTokenUpdate,
  ): Promise<AgentToken> {
    return this.tokens.setRevealFlag(subject, projectId, tokenId, body.canRevealVariables);
  }

  /** Отзывает токен в один клик. */
  @Delete(':tokenId')
  @HttpCode(204)
  async revoke(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
  ): Promise<void> {
    await this.tokens.revoke(subject, projectId, tokenId);
  }
}
