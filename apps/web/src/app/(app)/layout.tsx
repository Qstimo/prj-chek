import type { CurrentSubjectResponse } from '@cairn/shared';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ApiError } from '@/api';
import { apiServer } from '@/api/server';
import { AppNavContainer } from '@/components/AppNav/AppNavContainer';

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

  return (
    <>
      <AppNavContainer subject={subject} />
      {children}
    </>
  );
}
