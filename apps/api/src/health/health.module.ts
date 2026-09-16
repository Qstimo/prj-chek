import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/** Модуль проверки живости. Зависимостей нет — это его свойство, а не упущение. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
