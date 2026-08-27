import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Пакет контракта отдаётся исходниками и собирается вместе с приложением.
  transpilePackages: ['@cairn/shared'],
  // Переадресация на локальный API для разработки: реверс-прокси появится
  // в последнем чанке, а до тех пор запросы с фронтенда на `/api` нужно
  // куда-то перенаправлять вручную.
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' }];
  },
};

export default config;
