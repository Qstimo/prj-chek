'use client';

import { useState } from 'react';

import { RevokeButton } from './RevokeButton';
import { FormError } from '../FormError';
import type { IProps } from './types';

/**
 * Приёмный адрес проекта (ТЗ 5.2).
 *
 * Показывается пишущим в хронику: им и пересылать сводки.
 * Создание и отзыв — действия суперадмина.
 */
export function IntakeAddressPanel({
  address,
  isSuperadmin,
  onCreate,
  onRevoke,
  isPending = false,
  error,
}: IProps) {
  const [isCopied, setIsCopied] = useState(false);

  if (!address) {
    return (
      <section className="space-y-2 rounded-md border border-border p-4">
        <h2 className="text-lg font-medium">Приёмный адрес</h2>
        {isSuperadmin ? (
          <button
            type="button"
            disabled={isPending}
            onClick={onCreate}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            Создать адрес
          </button>
        ) : (
          <p className="text-muted-foreground">
            Приёмного адреса нет. Его создаёт администратор.
          </p>
        )}

        <FormError message={error} />
      </section>
    );
  }

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(address!.webhookUrl);
    setIsCopied(true);
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h2 className="text-lg font-medium">Приёмный адрес</h2>
      <p className="text-sm text-muted-foreground">
        Отправьте сводку POST-запросом на этот адрес — она появится в хронике.
      </p>

      <div className="flex items-center gap-2">
        <code className="break-all rounded bg-muted px-2 py-1 text-sm">{address.webhookUrl}</code>
        <button type="button" onClick={copy} className="rounded-md border px-3 py-1 text-sm">
          {isCopied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Почтовая форма: <code>{address.emailAddress}</code> — приём почты появится позже.
      </p>

      {isSuperadmin && <RevokeButton onRevoke={onRevoke} disabled={isPending} />}
      <FormError message={error} />
    </section>
  );
}
