'use client';

import { useState } from 'react';

import {
  COPIED_LABEL,
  COPY_MARKDOWN_LABEL,
  COPY_TEXT_LABEL,
  MANUAL_COPY_FIELD_LABEL,
  MANUAL_COPY_HINT,
} from './constants';
import { copyText } from './utils';

/** Пропсы копирования отчёта: оба текста приходят готовыми с сервера. */
interface IProps {
  markdown: string;
  text: string;
}

/**
 * Копирование отчёта: разметкой и без неё.
 *
 * Оба текста собраны на сервере одной функцией и приходят в отчёте
 * готовыми: собирать их здесь значило бы завести второй экземпляр правила,
 * который разошёлся бы с публичной страницей при первой же правке.
 *
 * Отказ буфера не молчит: без защищённого соединения `navigator.clipboard`
 * отсутствует вовсе, и кнопка выглядела бы сломанной. Вместо этого текст
 * показывается полем — его можно выделить и скопировать руками.
 */
export function CopyReport({ markdown, text }: IProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [manual, setManual] = useState<string | null>(null);

  const copy = async (value: string) => {
    const isCopied = await copyText(value);

    setCopied(isCopied ? COPIED_LABEL : null);
    setManual(isCopied ? null : value);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy(markdown)}
          className="rounded-md border border-border px-3 py-1 text-sm transition hover:bg-surface-strong"
        >
          {COPY_MARKDOWN_LABEL}
        </button>
        <button
          type="button"
          onClick={() => void copy(text)}
          className="rounded-md border border-border px-3 py-1 text-sm transition hover:bg-surface-strong"
        >
          {COPY_TEXT_LABEL}
        </button>
        {/*
          Подтверждение видимое и слышимое: `role="status"` объявляет его
          читалке, не забирая фокус у кнопки.
        */}
        {copied && (
          <span role="status" className="text-sm text-muted-foreground">
            {copied}
          </span>
        )}
      </div>

      {manual !== null && (
        <div className="space-y-1">
          <p role="alert" className="text-sm text-destructive">
            {MANUAL_COPY_HINT}
          </p>
          <textarea
            readOnly
            aria-label={MANUAL_COPY_FIELD_LABEL}
            value={manual}
            rows={8}
            className="w-full rounded-md border border-border bg-surface p-2 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}
