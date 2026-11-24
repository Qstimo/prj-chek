'use client';

import type { ISecretFieldProps } from './types';

/**
 * Поле токена — **только на запись**.
 *
 * Заполнять его текущим значением нечем: сервер токена не отдаёт вовсе.
 * `type="password"` и `autocomplete="new-password"` — не украшение:
 * браузерный менеджер паролей не подставит сюда чужой пароль, а скриншот
 * экрана настроек не раскроет токен.
 *
 * «Убрать токен» отдельной кнопкой, потому что пустое поле означает «не
 * менять»: иначе открыть форму, ничего не трогая, и сохранить значило бы
 * стереть токен.
 *
 * Своё поле, а не поле ключа узла модели: совпадает у них один
 * `type="password"` и правило трёх состояний, а все четыре фразы — разные
 * («ключ у провайдера» против «токен в трекере»), и общий компонент принимал
 * бы четыре строки ради одного атрибута.
 */
export function SecretField({ hasSecret, value, isCleared, onChange, onClear }: ISecretFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="trackerSecret" className="block text-sm font-medium">
        Токен
      </label>
      <input
        id="trackerSecret"
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 transition focus:border-border-strong"
      />
      <p className="text-sm text-muted-foreground">
        Оставьте пустым, чтобы не менять. {hasSecret ? 'Токен задан.' : 'Токена нет.'} Без токена
        выгрузка выключена целиком, и кнопок выгрузки на экранах проектов нет.
      </p>

      {isCleared ? (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          Токен будет убран при сохранении.
        </p>
      ) : (
        <button type="button" onClick={onClear} className="text-sm hover:underline">
          Убрать токен
        </button>
      )}
    </div>
  );
}
