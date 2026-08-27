import { SubjectKind } from '@cairn/shared';
import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { RequestSubject } from '../access/access.types';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/db.types';
import { subjects, users } from '../db/schema';
import { SESSION_COOKIE } from './session.cookie';
import { SessionsRepository } from './sessions.repository';

/**
 * Превращает cookie сессии в субъект запроса.
 *
 * Субъект кладётся в запрос и дальше попадает во все репозитории первым
 * аргументом — на этом держится вся проверка прав (спека 5.4).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ cookies?: Record<string, string>; subject?: RequestSubject }>();

    const token = request.cookies?.[SESSION_COOKIE];

    if (!token) {
      throw new UnauthorizedException('Требуется вход');
    }

    const session = await this.sessions.findActive(token);

    if (!session) {
      throw new UnauthorizedException('Требуется вход');
    }

    const [found] = await this.db
      .select({ subject: subjects, user: users })
      .from(subjects)
      .leftJoin(users, eq(users.subjectId, subjects.id))
      .where(eq(subjects.id, session.subjectId))
      .limit(1);

    if (!found || found.subject.revokedAt !== null) {
      throw new UnauthorizedException('Требуется вход');
    }

    request.subject = {
      id: found.subject.id,
      kind: found.subject.kind as SubjectKind,
      label: found.subject.label,
      isSuperadmin: found.user?.isSuperadmin ?? false,
      isRevoked: false,
    };

    void this.sessions.touch(session.id);

    return true;
  }
}
