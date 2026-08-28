'use client';

import { useState } from 'react';

import type { IProps } from './types';

/**
 * Публичная ссылка роадмапа (ТЗ 3.5) — единственная секция, видимая наружу.
 *
 * Включение проговаривает последствие: страница станет доступна всем,
 * у кого есть ссылка. Отключение гасит прежнюю ссылку навсегда.
 */
export function PublicLinkPanel({
  link,
  isSuperadmin,
  onPublish,
  onUnpublish,
  isPending = false,
}: IProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h2 className="text-lg font-medium">Публичная ссылка</h2>

      {link ? (
        <>
          <div className="flex items-center gap-2">
            <code className="break-all rounded bg-muted px-2 py-1 text-sm">{link.url}</code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(link.url);
                setIsCopied(true);
              }}
              className="rounded-md border px-3 py-1 text-sm"
            >
              {isCopied ? 'Скопировано' : 'Скопировать'}
            </button>
          </div>

          {isSuperadmin &&
            (isConfirming ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={onUnpublish}
                  className="rounded-md bg-destructive px-3 py-1 text-sm text-destructive-foreground"
                >
                  Подтвердить отключение
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirming(false)}
                  className="rounded-md border px-3 py-1 text-sm"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirming(true)}
                className="rounded-md border px-3 py-1 text-sm"
              >
                Отключить ссылку
              </button>
            ))}
        </>
      ) : isSuperadmin ? (
        <>
          <p className="text-sm text-muted-foreground">
            После публикации страница роадмапа станет доступна всем, у кого есть ссылка, —
            включая формулировки чекпоинтов.
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={onPublish}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            Опубликовать
          </button>
        </>
      ) : (
        <p className="text-muted-foreground">Роадмап не опубликован.</p>
      )}
    </section>
  );
}
