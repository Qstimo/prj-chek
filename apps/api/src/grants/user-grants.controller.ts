import { type UserGrantRow } from '@cairn/shared';
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { SuperadminGuard } from '../access/superadmin.guard';
import { SessionGuard } from '../auth/session.guard';
import { UsersService } from '../users/users.service';
import { GrantsService } from './grants.service';

/**
 * Выдачи со стороны человека — второй срез той же таблицы.
 *
 * Живёт в модуле выдач, а не рядом с остальными `/users/*`: это выдачи,
 * и держать их в одном модуле важнее, чем собрать все маршруты человека
 * в одном файле. Записи здесь нет — она идёт проектными маршрутами,
 * чтобы правило и журналирование остались в одном месте.
 */
@Controller('users/:userId/grants')
@UseGuards(SessionGuard, SuperadminGuard)
export class UserGrantsController {
  constructor(
    private readonly grants: GrantsService,
    private readonly users: UsersService,
  ) {}

  /** Строки «проект × уровни» по проектам, где есть выдача. */
  @Get()
  async matrix(@Param('userId', ParseUUIDPipe) userId: string): Promise<UserGrantRow[]> {
    const subjectId = await this.users.subjectIdOfUser(userId);

    return this.grants.matrixForSubject(subjectId);
  }
}
