'use client';

import { HealthState } from '@cairn/shared';
import { pluralize } from '@/utils';
import { AddressStatusRow } from './AddressStatusRow';
import type { IProps } from './types';

/**
 * Responsive cards keep the three independent checks readable at any width.
 *
 * Сетка стоит на окружениях, а не только внутри них: у окружения часто
 * один адрес, и внутренняя сетка оставляла правую половину экрана пустой
 * независимо от числа окружений. Окружение с одним адресом занимает
 * колонку, с несколькими — обе: сжимать две карточки в половину экрана
 * незачем, рядом с ними всё равно никто не встанет.
 */
export function StatusByEnvironment({ environments, addresses, onSelect }: IProps) {
  return (
    <div aria-label="Проверки адресов" className="grid gap-6 lg:grid-cols-2">
      {environments.map((environment) => {
        const own = addresses.filter((address) => address.environmentId === environment.environmentId);
        return (
          <section key={environment.environmentId} aria-label={environment.name} className={`min-w-0 space-y-3 ${own.length > 1 ? 'lg:col-span-2' : ''}`}>
            <header className="flex min-w-0 flex-wrap items-center gap-3">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${environment.health === HealthState.Down ? 'bg-destructive' : environment.health === HealthState.Up ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
              <h3 className="min-w-0 font-medium [overflow-wrap:anywhere]">{environment.name}</h3>
              <span className="text-xs text-muted-foreground">{pluralize(own.length, 'адрес', 'адреса', 'адресов')}</span>
            </header>
            {own.length === 0 ? <p className="text-sm text-muted-foreground">Нет адресов — проверять нечего</p> : (
              <div className="grid gap-3 lg:grid-cols-2">
                {own.map((address) => <AddressStatusRow key={address.domainId} address={address} onSelect={onSelect} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
