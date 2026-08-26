import { Global, Module } from '@nestjs/common';

import { CryptoService, ENCRYPTION_KEY } from './crypto.service';

/**
 * Модуль шифрования. Глобальный: сервис нужен разным модулям, а состояние
 * у него единственное — ключ.
 */
@Global()
@Module({
  providers: [
    { provide: ENCRYPTION_KEY, useFactory: () => process.env.CAIRN_ENCRYPTION_KEY },
    CryptoService,
  ],
  exports: [CryptoService],
})
export class CryptoModule {}
