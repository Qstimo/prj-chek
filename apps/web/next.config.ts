import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Пакет контракта отдаётся исходниками и собирается вместе с приложением.
  transpilePackages: ['@cairn/shared'],
};

export default config;
