'use client';

import Link from 'next/link';
import { useState } from 'react';

import { TEXT_TEXTS } from './constants';
import type { IProps } from './types';

/** Чем кончилось копирование: сказать надо и про успех, и про отказ. */
enum CopyOutcome {
  Copied = 'copied',
  Failed = 'failed',
}

/**
 * Текст саммари с копированием и ссылкой на запись хроники.
 *
 * Текст живёт в `<pre>` со значением, а не в Markdown-рендере: он пришёл
 * от человека и может содержать что угодно, а разметка из него не
 * получается никогда (дизайн, раздел 5.6, пункт 4).
 */
export function SummaryText({ text, chronicleHref, actions }: IProps) {
  const [outcome, setOutcome] = useState<CopyOutcome>();

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setOutcome(CopyOutcome.Copied);
    } catch {
      setOutcome(CopyOutcome.Failed);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md border border-border px-3 py-1 text-sm"
        >
          {TEXT_TEXTS.copy}
        </button>
        {actions}
        {outcome && (
          <span role="status" className="text-sm text-muted-foreground">
            {outcome === CopyOutcome.Copied ? TEXT_TEXTS.copied : TEXT_TEXTS.copyFailed}
          </span>
        )}
      </div>

      {/* Своя полоса прокрутки, и на широком экране предел считается от
          окна: текст живёт в колонке рабочего экрана и обязан занять её
          высоту целиком, а не растянуть страницу — иначе соседняя колонка
          с задачами уезжает за край у часового созвона (дизайн, 4.2).
          `16rem` — то, что над текстом: полоса навигации, шапка страницы
          и собственная кнопочная строка. */}
      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-3 text-sm lg:max-h-[calc(100vh-16rem)]">
        {text}
      </pre>

      <Link href={chronicleHref} className="text-sm text-muted-foreground hover:underline">
        {TEXT_TEXTS.chronicleLink}
      </Link>
    </div>
  );
}
