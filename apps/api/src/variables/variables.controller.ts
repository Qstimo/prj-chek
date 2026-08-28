import {
  importEnvSchema,
  rollbackSchema,
  variableCreateSchema,
  variableUpdateSchema,
  type ImportEnvInput,
  type ImportResult,
  type RevealResponse,
  type RollbackInput,
  type Variable,
  type VariableCreate,
  type VariableUpdate,
  type VariableVersion,
  type VariablesEnvironment,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { VariablesService } from './variables.service';

/**
 * Секция «Переменные» (спека 6).
 *
 * Раскрытие — POST, а не GET: у действия есть побочный эффект (журнал),
 * и кэширование или предзагрузка браузером здесь недопустимы.
 */
@Controller('projects/:projectId/environments/:environmentId/variables')
@UseGuards(SessionGuard)
export class VariablesController {
  constructor(private readonly variables: VariablesService) {}

  /** Список без значений — на любом уровне доступа. */
  @Get()
  async list(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ): Promise<Variable[]> {
    return this.variables.list(subject, projectId, environmentId);
  }

  /** Создаёт переменную с первой версией значения. */
  @Post()
  async create(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Body(new ZodValidationPipe(variableCreateSchema)) body: VariableCreate,
  ): Promise<Variable> {
    await this.variables.create(subject, projectId, environmentId, body);

    return this.findInList(subject, projectId, environmentId, body.key);
  }

  /** Импорт `.env`: upsert без удаления. */
  @Post('import')
  async importEnv(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Body(new ZodValidationPipe(importEnvSchema)) body: ImportEnvInput,
  ): Promise<ImportResult> {
    return this.variables.importEnv(subject, projectId, environmentId, body.content);
  }

  /** Выгрузка `.env`. Массовое раскрытие — фиксируется в журнале. */
  @Get('export')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async exportEnv(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ): Promise<string> {
    return this.variables.exportEnv(subject, projectId, environmentId);
  }

  /** Правка. Поле `value` создаёт новую версию. */
  @Patch(':id')
  async update(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(variableUpdateSchema)) body: VariableUpdate,
  ): Promise<Variable> {
    const updated = await this.variables.update(subject, projectId, environmentId, id, body);

    return this.findInList(subject, projectId, environmentId, updated.key);
  }

  /** Удаляет переменную вместе с версиями. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.variables.remove(subject, projectId, environmentId, id);
  }

  /** Раскрывает текущее значение. */
  @Post(':id/reveal')
  async reveal(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RevealResponse> {
    return this.variables.reveal(subject, projectId, environmentId, id);
  }

  /** История версий без значений. */
  @Get(':id/versions')
  async versions(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VariableVersion[]> {
    return this.variables.versions(subject, projectId, environmentId, id);
  }

  /** Раскрывает историческую версию. */
  @Post(':id/versions/:versionNo/reveal')
  async revealVersion(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionNo', ParseIntPipe) versionNo: number,
  ): Promise<RevealResponse> {
    return this.variables.revealVersion(subject, projectId, environmentId, id, versionNo);
  }

  /** Откат: новая версия со значением указанной. */
  @Post(':id/rollback')
  async rollback(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rollbackSchema)) body: RollbackInput,
  ): Promise<{ versionNo: number }> {
    return {
      versionNo: await this.variables.rollback(
        subject,
        projectId,
        environmentId,
        id,
        body.toVersion,
      ),
    };
  }

  /** Ответ создания и правки — строка списка: без значения, с номером версии. */
  private async findInList(
    subject: RequestSubject,
    projectId: string,
    environmentId: string,
    key: string,
  ): Promise<Variable> {
    const list = await this.variables.list(subject, projectId, environmentId);

    return list.find((variable) => variable.key === key)!;
  }
}

/** Окружения проекта для переключателя страницы переменных (спека 7). */
@Controller('projects/:projectId/variables')
@UseGuards(SessionGuard)
export class VariablesEnvironmentsController {
  constructor(private readonly variables: VariablesService) {}

  /** Список окружений по уровню секции «Переменные», а не «Инфраструктура». */
  @Get('environments')
  async environments(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<VariablesEnvironment[]> {
    return this.variables.listEnvironments(subject, projectId);
  }
}
