import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { QueryProvider } from '@/api/QueryProvider';

import './globals.css';

/** Заголовок вкладки и описание приложения. */
export const metadata: Metadata = {
  title: 'CAIRN — реестр проектов',
  description: 'Где проект развёрнут, чем настроен и на какой стадии находится',
};

/** Корневая разметка. Язык интерфейса — русский, без локализации (спека 9). */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
