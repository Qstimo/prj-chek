import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { AccessService } from './access/access.service';
import { AuthService } from './auth/auth.service';
import { HealthController } from './health/health.controller';
import { ProjectsService } from './projects/projects.service';

describe('AppModule', () => {
  it('собирается со всеми модулями', async () => {
    // Проверяет, что зависимости разрешаются: пропущенный импорт модуля
    // проявился бы здесь, а не при первом запросе в бою.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(AccessService)).toBeDefined();
    expect(moduleRef.get(AuthService)).toBeDefined();
    expect(moduleRef.get(ProjectsService)).toBeDefined();
    // Проверка живости должна быть собрана в приложении: без неё docker-compose
    // считал бы контейнер нездоровым и перезапускал его по кругу.
    expect(moduleRef.get(HealthController)).toBeDefined();

    await moduleRef.close();
  });
});
