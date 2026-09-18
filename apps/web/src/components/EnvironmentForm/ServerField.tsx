'use client';

import { FIELD_LABELS, SERVER_HINT } from './constants';
import type { ServerOption } from './types';

/** Пропсы поля привязки к серверу. */
interface IProps {
  value: string | null;
  /** Имя привязанной машины: реестра у подрядчика нет, имя приходит с окружением. */
  valueName: string | null;
  servers: ServerOption[];
  /** Право выбирать машину. Есть только у суперадмина. */
  canAssign: boolean;
  onChange: (value: string | null) => void;
}

/**
 * Привязка окружения к серверу.
 *
 * Выпадающий список показывается только суперадмину: перечень машин
 * межпроектен, и подрядчик увидел бы в нём чужую инфраструктуру. Остальным
 * остаётся имя уже привязанной машины — про свой проект они его и так знают.
 */
export function ServerField({ value, valueName, servers, canAssign, onChange }: IProps) {
  if (!canAssign) {
    return (
      <p className="text-sm text-muted-foreground">
        {valueName ? `Сервер: ${valueName}` : 'Сервер не привязан'}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <label htmlFor="serverId" className="block text-sm font-medium">
        {FIELD_LABELS.serverId}
      </label>
      <select
        id="serverId"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="w-full rounded-md border border-border px-3 py-2"
      >
        <option value="">Не привязан</option>
        {servers.map((server) => (
          <option key={server.id} value={server.id}>
            {server.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{SERVER_HINT}</p>
    </div>
  );
}
