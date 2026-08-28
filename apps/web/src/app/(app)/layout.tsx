import type { CurrentSubjectResponse } from '@cairn/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { AppNavContainer } from '@/components/AppNav/AppNavContainer';

import { requiresTotpBinding } from './requiresTotpBinding';

/** Разметка раздела для вошедших пользователей. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let subject: CurrentSubjectResponse;

  try {
    subject = await apiServer<CurrentSubjectResponse>('/auth/me');
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      redirect('/login');
    }

    throw cause;
  }

  // Спека 6.4: до привязки второго фактора суперадмину доступен
  // единственный экран. Проверка на сервере, а не в навигации:
  // прямой переход по адресу должен упираться в то же ограничение.
  if (requiresTotpBinding(subject, process.env.CAIRN_ALLOW_INSECURE_NO_TOTP === '1')) {
    const path = (await headers()).get('x-pathname') ?? '';

    if (!path.startsWith('/security')) {
      redirect('/security');
    }
  }

  return (
    <>
      <AppNavContainer subject={subject} />
      {children}
    </>
  );
}
