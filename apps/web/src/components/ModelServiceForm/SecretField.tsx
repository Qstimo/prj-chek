'use client';

import type { ISecretFieldProps } from './types';

/**
 * Поле ключа — **только на запись**.
 *
 * Заполнять его текущим значением нечем: сервер ключа не отдаёт вовсе
 * (дизайн, 3.4). `type="password"` и `autocomplete="new-password"` — не
 * украшение: браузерный менеджер паролей не подставит сюда чужой пароль,
 * а скриншот экрана администрирования не раскроет ключ.
 *
 * «Убрать ключ» отдельной кнопкой, потому что пустое поле означает «не
 * менять»: иначе открыть форму, ничего не трогая, и сохранить значило бы
 * стереть ключ.
 */
export function SecretField({ hasSecret, value, isCleared, onChange, onClear }: ISecretFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="secret" className="block text-sm font-medium">
        Ключ
      </label>
      <input
        id="secret"
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 transition focus:border-border-strong"
      />
      <p className="text-sm text-muted-foreground">
        Оставьте пустым, чтобы не менять. {hasSecret ? 'Ключ задан.' : 'Ключа нет.'} Версий ключа
        нет: сменили — старый у провайдера не вернуть.
      </p>

      {isCleared ? (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          Ключ будет убран при сохранении.
        </p>
      ) : (
        <button type="button" onClick={onClear} className="text-sm hover:underline">
          Убрать ключ
        </button>
      )}
    </div>
  );
}
