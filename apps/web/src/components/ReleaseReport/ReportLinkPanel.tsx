'use client';

import { useState } from 'react';

import { ConfirmDialog } from '../ConfirmDialog';
import { FormError } from '../FormError';
import {
  COPIED_LABEL,
  LINK_ABSENT_NOTE,
  LINK_PANEL_TITLE,
  LINK_PUBLISH_WARNING,
  MANUAL_COPY_HINT,
} from './constants';
import type { ILinkProps } from './types';
import { copyText } from './utils';

/**
 * Публичная ссылка на отчёт по релизу.
 *
 * Своя, а не общая с роадмапом: ссылка на весь роадмап раскрыла бы заодно
 * все планы, поэтому у отчёта отдельный токен, отдельная таблица и
 * отдельная панель. Формулировки здесь говорят об отчёте — панель роадмапа
 * на его странице сообщала бы «роадмап не опубликован», что неправда.
 *
 * Включение проговаривает последствие до нажатия, отключение требует
 * подтверждения: прежняя ссылка гаснет навсегда.
 */
export function ReportLinkPanel({
  link,
  isSuperadmin,
  onPublish,
  onUnpublish,
  isPending = false,
  error,
}: ILinkProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h2 className="text-lg font-medium">{LINK_PANEL_TITLE}</h2>

      {link ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-muted px-2 py-1 text-sm">{link.url}</code>
            <button
              type="button"
              onClick={async () => {
                setCopied((await copyText(link.url)) ? COPIED_LABEL : MANUAL_COPY_HINT);
              }}
              className="rounded-md border border-border px-3 py-1 text-sm"
            >
              Скопировать
            </button>
            {copied && (
              <span role="status" className="text-sm text-muted-foreground">
                {copied}
              </span>
            )}
          </div>

          {isSuperadmin &&
            (isConfirming ? (
              <ConfirmDialog
                label="Отключение публичной ссылки"
                confirmLabel="Подтвердить отключение"
                onConfirm={onUnpublish}
                onCancel={() => setIsConfirming(false)}
              >
                Прежняя ссылка перестанет открываться навсегда: у тех, кому её уже прислали,
                страница отчёта пропадёт.
              </ConfirmDialog>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsConfirming(true)}
                className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
              >
                Отключить ссылку
              </button>
            ))}
        </>
      ) : isSuperadmin ? (
        <>
          <p className="text-sm text-muted-foreground">{LINK_PUBLISH_WARNING}</p>
          <button
            type="button"
            disabled={isPending}
            onClick={onPublish}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            Опубликовать отчёт
          </button>
        </>
      ) : (
        <p className="text-muted-foreground">{LINK_ABSENT_NOTE}</p>
      )}

      <FormError message={error} />
    </section>
  );
}
