'use client';

import type { CurrentSubjectResponse } from '@cairn/shared';
import { useRouter } from 'next/navigation';

import { apiClient } from '@/api';

import { AppNav } from './AppNav';

/** Навигация с обработчиком выхода. */
export function AppNavContainer({ subject }: { subject: CurrentSubjectResponse }) {
  const router = useRouter();

  async function logout(): Promise<void> {
    await apiClient('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return <AppNav subject={subject} onLogout={() => void logout()} />;
}
