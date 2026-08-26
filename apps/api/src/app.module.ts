import { Module } from '@nestjs/common';

import { CryptoModule } from './crypto/crypto.module';

/** Корневой модуль приложения. Модули добавляются по мере реализации. */
@Module({
  imports: [CryptoModule],
})
export class AppModule {}
