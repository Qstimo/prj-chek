'use client';

import { hostnameOf, rootDomainOf } from '@cairn/shared';
import { useState } from 'react';

import { parseAddress, rootHintOf } from '@/utils';

import { FormError } from '../FormError';
import { DomainOptions } from './DomainOptions';
import { SelectedDomains } from './SelectedDomains';
import type { IProps } from './types';

/**
 * Набор доменов окружения.
 *
 * Домены нормализуются здесь так же, как на сервере: пользователь должен
 * видеть ровно то, что будет сохранено, а не узнавать о приведении
 * к нижнему регистру после сохранения.
 *
 * Подсказка известных адресов появляется только вместе со списком —
 * то есть только у того, кому виден реестр доменов.
 */
export function DomainsField({ value, onChange, knownDomains }: IProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isRegistryVisible = knownDomains !== undefined;
  const parsed = parseAddress(draft, (knownDomains ?? []).map(rootDomainOf));
  const matches = (knownDomains ?? []).filter(
    (domain) => domain.includes(hostnameOf(draft)) && !value.includes(domain),
  );

  function add(candidate: string): void {
    // Нормализация та же, что на сервере: вставленный из браузера адрес
    // сохранится именем хоста, и человек увидит это сразу.
    const domain = hostnameOf(candidate);

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
        <button
          type="button"
          onClick={() => add(draft)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Добавить домен
        </button>
      </div>

      {parsed && (
        <p className="text-xs text-muted-foreground">{rootHintOf(parsed, isRegistryVisible)}</p>
      )}

      {isRegistryVisible && parsed && (
        <DomainOptions
          matches={matches}
          draft={parsed.name}
          canCreate={!matches.includes(parsed.name) && !value.includes(parsed.name)}
          onPick={add}
        />
      )}

      <FormError message={error ?? undefined} />

      <SelectedDomains
        value={value}
        onRemove={(domain) => onChange(value.filter((item) => item !== domain))}
      />

    </div>
  );
}
