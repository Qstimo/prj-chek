import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Пакет контракта отдаётся исходниками и собирается вместе с приложением.
  transpilePackages: ['@cairn/shared'],
  // Самодостаточная сборка для контейнера: Next кладёт в `.next/standalone`
  // сервер вместе с трассированными зависимостями. Без этого в образ пришлось
  // бы ставить зависимости пакетным менеджером и держать там TypeScript —
  // `next start` читает этот конфиг при запуске и без него не стартует.
  output: 'standalone',
  // Корень трассировки — корень монорепо, иначе Next не найдёт зависимости,
  // лежащие в общем `node_modules` рабочих пространств.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // В разработке API проксируется здесь; в развёрнутой системе — реверс-прокси.
  async rewrites() {
    if (process.env.NODE_ENV === 'production') {
      return [];
    }

    return [{ source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' }];
  },
};

export default config;
