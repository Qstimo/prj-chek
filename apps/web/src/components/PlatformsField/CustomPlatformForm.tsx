'use client';

import { PlatformKind, type PlatformCreate } from '@cairn/shared';
import { useState } from 'react';

import { Select, SelectWidth } from '../Select';
import { PLATFORM_KIND_LABELS } from './constants';

/** Пропсы формы своей платформы. */
interface IProps {
  onAdd: (input: PlatformCreate) => void;
}

/**
 * Своя платформа: имя и вид.
 *
 * Несмотря на имя, не `<form>`: поле платформ живёт слотом внутри формы
 * проекта, и вложенная форма недопустима. Добавление — кнопкой, а не
 * по Enter: Enter здесь отправит внешнюю форму проекта.
 */
export function CustomPlatformForm({ onAdd }: IProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PlatformKind>(PlatformKind.Server);

  function add(): void {
    const trimmed = name.trim();

    if (trimmed.length === 0) {
      return;
    }

    onAdd({ kind, name: trimmed });
    setName('');
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label htmlFor="platform-name" className="block text-sm font-medium">
          Своя платформа
        </label>
        <input
          id="platform-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-md border border-border px-3 py-2"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="platform-kind" className="block text-sm font-medium">
          Вид
        </label>
        <Select
          id="platform-kind"
          value={kind}
          onChange={(next) => setKind(next as PlatformKind)}
          width={SelectWidth.Auto}
        >
          {Object.values(PlatformKind).map((value) => (
            <option key={value} value={value}>
              {PLATFORM_KIND_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <button type="button" onClick={add} className="rounded-md border px-3 py-2 text-sm">
        Добавить платформу
      </button>
    </div>
  );
}
