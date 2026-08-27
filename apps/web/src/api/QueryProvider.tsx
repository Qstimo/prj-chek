'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ApiError } from './errors';

/**
 * Провайдер кэша запросов.
 *
 * Клиент создаётся в состоянии компонента, а не в модуле: общий на весь
 * процесс клиент на сервере смешал бы данные разных пользователей.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Отказ в правах и отсутствие объекта повторять бессмысленно.
              if (error instanceof ApiError && error.status < 500) {
                return false;
              }

              return failureCount < 2;
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
