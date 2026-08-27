import { auditQuerySchema, type AuditPage, type AuditQuery } from '@cairn/shared';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { SuperadminGuard } from '../access/superadmin.guard';
import { SessionGuard } from '../auth/session.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditQueryService } from './audit-query.service';

/** Журнал действий. Доступен только суперадмину (спека 8). */
@Controller('audit')
@UseGuards(SessionGuard, SuperadminGuard)
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  /** Страница журнала с фильтрами. */
  @Get()
  async query(
    @Query(new ZodValidationPipe(auditQuerySchema)) filters: AuditQuery,
  ): Promise<AuditPage> {
    return this.audit.query(filters);
  }
}
