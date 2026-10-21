import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { AccessService } from './access/access.service';
import { AuthService } from './auth/auth.service';
import { HealthController } from './health/health.controller';
import { IncidentsController } from './incidents/incidents.controller';
import { PushNotifier } from './push/push.notifier';
import { INCIDENT_NOTIFIER } from './status/notifier';
import { PlatformsService } from './platforms/platforms.service';
import { ProjectsService } from './projects/projects.service';

describe('AppModule', () => {
  it('собирается со всеми модулями', async () => {
    // Проверяет, что зависимости разрешаются: пропущенный импорт модуля
    // проявился бы здесь, а не при первом запросе в бою.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(AccessService)).toBeDefined();
    expect(moduleRef.get(AuthService)).toBeDefined();
    expect(moduleRef.get(ProjectsService)).toBeDefined();
    expect(moduleRef.get(PlatformsService)).toBeDefined();
    // Проверка живости должна быть собрана в приложении: без неё docker-compose
    // считал бы контейнер нездоровым и перезапускал его по кругу.
    expect(moduleRef.get(HealthController)).toBeDefined();
    expect(moduleRef.get(IncidentsController)).toBeDefined();
    expect(moduleRef.get(PushNotifier)).toBeDefined();
    // Прогон обязан получить уведомитель: без поставщика токена инциденты
    // писались бы, а пуши молчали — и молчали бы незаметно.
    expect(moduleRef.get(INCIDENT_NOTIFIER)).toBeDefined();

    await moduleRef.close();
  });
});
