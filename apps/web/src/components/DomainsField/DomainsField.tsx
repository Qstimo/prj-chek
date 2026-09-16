'use client';

import { useState } from 'react';

import { FormError } from '../FormError';
import type { IProps } from './types';

/**
 * Набор доменов окружения.
 *
 * Домены нормализуются здесь так же, как на сервере: пользователь должен
 * видеть ровно то, что будет сохранено, а не узнавать о приведении
 * к нижнему регистру после сохранения.
 */
export function DomainsField({ value, onChange }: IProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add(): void {
    const domain = draft.trim().toLowerCase();

    if (!domain) {
      return;
    }

    if (value.includes(domain)) {
      setError('Такой домен уже добавлен');

      return;
    }

    onChange([...value, domain]);
    setDraft('');
    setError(null);
  }

  return (
    <div className="space-y-2">
      <label htmlFor="domain" className="block text-sm font-medium">
        Домены
      </label>

      <div className="flex gap-2">
        <input
          id="domain"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="flex-1 rounded-md border border-border px-3 py-2"
        />
        <button type="button" onClick={add} className="rounded-md border px-3 py-2 text-sm">
          Добавить домен
        </button>
      </div>

      <FormError message={error ?? undefined} />

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((domain) => (
            <li key={domain} className="flex items-center gap-2 rounded bg-muted px-2 py-1">
              <span className="text-sm">{domain}</span>
              <button
                type="button"
                aria-label={`Убрать ${domain}`}
                onClick={() => onChange(value.filter((item) => item !== domain))}
                className="text-sm text-muted-foreground"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
