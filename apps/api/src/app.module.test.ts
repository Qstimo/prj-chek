import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { AccessService } from './access/access.service';
import { AuthService } from './auth/auth.service';
import { ProjectsService } from './projects/projects.service';

describe('AppModule', () => {
  it('собирается со всеми модулями', async () => {
    // Проверяет, что зависимости разрешаются: пропущенный импорт модуля
    // проявился бы здесь, а не при первом запросе в бою.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(AccessService)).toBeDefined();
    expect(moduleRef.get(AuthService)).toBeDefined();
    expect(moduleRef.get(ProjectsService)).toBeDefined();

    await moduleRef.close();
  });
});
