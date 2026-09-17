'use client';

import { useState } from 'react';

import { DomainForm } from '../DomainForm';
import { SubdomainFields } from './SubdomainFields';
import type { IProps } from './types';
import { parseAddress, rootHintOf } from './utils';

/**
 * Одно поле адреса вместо двух разных путей.
 *
 * Корень и поддомен различает разбор, а не человек: раньше поддомен
 * нельзя было завести из реестра вовсе, и почему — никто не объяснял.
 * Дальше форма ветвится: у корня спрашиваются его свойства, у поддомена —
 * проект и окружение, которым он принадлежит.
 */
export function DomainAddressForm({
  knownRoots,
  projects,
  environments,
  projectId,
  onProjectChange,
  onSubmitRoot,
  onSubmitSubdomain,
  isSubmitting = false,
  error,
  rootSuffix,
}: IProps) {
  const [draft, setDraft] = useState('');
  const parsed = parseAddress(draft, knownRoots, rootSuffix);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="address" className="block text-sm font-medium">
          Адрес
        </label>
        <div className="flex items-center gap-2">
          <input
            id="address"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2"
          />
          {rootSuffix && <span className="text-muted-foreground">.{rootSuffix}</span>}
        </div>
        {parsed && <p className="text-sm text-muted-foreground">{rootHintOf(parsed)}</p>}
      </div>

      {parsed?.isRoot && onSubmitRoot && (
        // Свойства корня живут в собственном состоянии вложенной формы;
        // ключ пересобирает её, когда адрес поправили.
        <DomainForm
          key={parsed.name}
          initial={{ name: parsed.name, owner: null, registrar: null, paidUntil: null, notes: null }}
          isNameLocked
          isSubmitting={isSubmitting}
          error={error}
          onSubmit={onSubmitRoot}
        />
      )}

      {parsed && !parsed.isRoot && (
        <SubdomainFields
          projects={projects}
          environments={environments}
          projectId={projectId}
          onProjectChange={onProjectChange}
          isSubmitting={isSubmitting}
          error={error}
          onSubmit={(environmentId) =>
            onSubmitSubdomain({ name: parsed.name, projectId, environmentId })
          }
        />
      )}
    </div>
  );
}
