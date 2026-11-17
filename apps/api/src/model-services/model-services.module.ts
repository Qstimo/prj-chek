import { Module } from '@nestjs/common';

import { DbModule } from '../db/db.module';
import { ModelServiceSettingsService } from './model-service-settings.service';
import { ModelServicesRepository } from './model-services.repository';

/**
 * Модуль настройки служб модели.
 *
 * Наружу отдаёт только службу разрешения: репозиторий остаётся внутри,
 * потому что писать настройку вправе лишь свои ручки под
 * `SuperadminGuard`, а читать её потребителям нужно уже разрешённой —
 * с выбранным источником и расшифрованным ключом (дизайн, 5.2).
 *
 * `CryptoService` не импортируется: его модуль глобальный, и второго
 * механизма шифрования в системе не появляется.
 */
@Module({
  imports: [DbModule],
  providers: [ModelServicesRepository, ModelServiceSettingsService],
  exports: [ModelServiceSettingsService],
})
export class ModelServicesModule {}
