'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useMutationTotpConfirm, useMutationTotpSetup } from '@/api/hooks';
import { TotpSetup } from '@/components/TotpSetup';
import { describeApiError } from '@/api';

/** Привязка второго фактора для текущего пользователя. */
export function SecurityScreen() {
  const router = useRouter();
  const setup = useMutationTotpSetup();
  const confirm = useMutationTotpConfirm();

  // Привязка начинается сразу при открытии: отдельная кнопка «начать»
  // ничего не добавляет — человек пришёл сюда именно за этим.
  useEffect(() => {
    setup.mutate();
    // Запускается один раз на открытие экрана.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (setup.isError) {
    return (
      <p role="alert" className="text-destructive">
        {describeApiError(setup.error)}
      </p>
    );
  }

  if (setup.isPending || !setup.data) {
    return <p className="text-muted-foreground">Подготовка…</p>;
  }

  return (
    <TotpSetup
      setup={setup.data}
      isSubmitting={confirm.isPending}
      error={confirm.error?.message}
      onConfirm={(code) =>
        confirm.mutate(code, {
          onSuccess: () => {
            router.replace('/');
            router.refresh();
          },
        })
      }
    />
  );
}
