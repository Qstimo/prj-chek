'use client';

import { HealthState } from '@cairn/shared';
import type { IAddressProps } from './types';
import { checkedAtTextOf, healthNoteTextOf, healthTextOf, registryTextOf, registryExplanationOf, tlsTextOf } from './utils';

export function AddressStatusRow({ address, onSelect }: IAddressProps) {
  const note = healthNoteTextOf(address);
  const days = address.tlsValidTo ? Math.ceil((Date.parse(address.tlsValidTo) - Date.now()) / 86_400_000) : null;
  const tlsAttention = address.tlsTrusted === false || (days !== null && days <= 14);
  return (
    <article aria-label={address.name} className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-sm [overflow-wrap:anywhere]">
      <header className="mb-4 flex items-start justify-between gap-3">
        {onSelect ? <button type="button" onClick={() => onSelect(address.domainId)} className="min-w-0 break-all text-left font-medium text-primary hover:underline">{address.name}</button> : <h4 className="min-w-0 break-all font-medium">{address.name}</h4>}
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${address.health === HealthState.Down ? 'bg-destructive/10 text-destructive' : address.health === HealthState.Up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
          {address.health === HealthState.Down ? 'Не отвечает' : address.health === HealthState.Up ? 'В сети' : 'Нет данных'}
        </span>
      </header>
      <dl className="space-y-3 text-sm">
        <div data-health={address.health ?? 'unknown'}><dt className="mb-1 text-xs text-muted-foreground">Доступность</dt><dd className={address.health === HealthState.Down ? 'text-destructive' : undefined}>{healthTextOf(address)}{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}</dd></div>
        <div className={`rounded-lg p-3 ${tlsAttention ? 'bg-amber-500/10 text-amber-300' : 'bg-muted'}`}><dt className="mb-1 text-xs text-muted-foreground">Сертификат TLS</dt><dd>{tlsTextOf(address)}{days !== null && address.tlsTrusted !== false && days <= 14 && <p className="mt-1 font-medium">{days < 0 ? 'Срок сертификата истёк' : `До истечения: ${days} дн.`}</p>}</dd></div>
        <div><dt className="mb-1 text-xs text-muted-foreground">Регистрация домена</dt><dd className="text-muted-foreground">{registryTextOf(address)}{address.registryError && <details className="mt-1 text-xs"><summary className="cursor-pointer">Почему нет данных</summary><p className="mt-2">{registryExplanationOf(address.registryError)}</p><p className="mt-1 break-words">Ответ поставщика: {address.registryError}</p></details>}</dd></div>
      </dl>
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{address.checkedAt ? `Проверено: ${checkedAtTextOf(address.checkedAt)}` : 'Ожидает первой проверки'}</p>
    </article>
  );
}
