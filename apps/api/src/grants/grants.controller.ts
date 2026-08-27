import {
  grantRevokeSchema,
  grantSetSchema,
  type GrantMatrixRow,
  type GrantRevoke,
  type GrantSet,
} from '@cairn/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';

import { SuperadminGuard } from '../access/superadmin.guard';
import type { RequestSubject } from '../access/access.types';
import { CurrentSubject } from '../auth/current-subject.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GrantsService } from './grants.service';

/**
 * Управление доступами (спека 8).
 *
 * Весь контроллер закрыт guard'ом суперадмина: уровень доступа к самому
 * проекту здесь роли не играет.
 */
@Controller('projects/:projectId/grants')
@UseGuards(SessionGuard, SuperadminGuard)
export class GrantsController {
  constructor(private readonly grants: GrantsService) {}

  /** Матрица «субъект × секция» по проекту. */
  @Get()
  async matrix(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<GrantMatrixRow[]> {
    return this.grants.matrix(projectId);
  }

  /** Устанавливает уровень доступа для пары «субъект × секция». */
  @Put()
  @HttpCode(200)
  async set(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(grantSetSchema)) body: GrantSet,
  ): Promise<void> {
    await this.grants.set(subject, projectId, body);
  }

  /** Отзывает выдачу по паре «субъект × секция». */
  @Delete()
  @HttpCode(204)
  async revoke(
    @CurrentSubject() subject: RequestSubject,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(grantRevokeSchema)) body: GrantRevoke,
  ): Promise<void> {
    await this.grants.revoke(subject, projectId, body);
  }
}
