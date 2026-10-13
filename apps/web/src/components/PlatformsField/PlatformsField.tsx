'use client';

import { useState } from 'react';

import { ConfirmDialog } from '../ConfirmDialog';
import { CustomPlatformForm } from './CustomPlatformForm';
import { PlatformSuggestions } from './PlatformSuggestions';
import { REMOVE_CONFIRM_HINT, REMOVE_CONFIRM_LABEL } from './constants';
import type { FieldPlatform, IProps } from './types';

/**
 * Поле платформ проекта: чипы, подсказки и своя платформа.
 *
 * Что делают колбэки, решает родитель: панель создания меняет своё
 * состояние и отправляет платформы вместе с проектом, панель правки
 * вызывает мутации сразу — как галочки чекпоинтов.
 *
 * Поэтому и подтверждение спрашивается только у записанной платформы
 * (с `id`): в панели создания чип ещё никуда не уехал, и терять нечего.
 */
export function PlatformsField({ platforms, onAdd, onRemove }: IProps) {
  const [confirming, setConfirming] = useState<FieldPlatform | null>(null);

  function remove(platform: FieldPlatform): void {
    if (!platform.id) {
      onRemove(platform);

      return;
    }

    setConfirming(platform);
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Платформы</span>

      {platforms.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {platforms.map((platform) => (
            <li
              key={platform.id ?? platform.name}
              className="flex items-center gap-2 rounded bg-muted px-2 py-1"
            >
              <span className="text-sm">{platform.name}</span>
              <button
                type="button"
                aria-label={`Убрать ${platform.name}`}
                onClick={() => remove(platform)}
                className="text-sm text-muted-foreground"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmDialog
          label={REMOVE_CONFIRM_LABEL}
          confirmLabel="Да, убрать"
          onConfirm={() => {
            onRemove(confirming);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        >
          Убрать «{confirming.name}» из проекта? {REMOVE_CONFIRM_HINT}
        </ConfirmDialog>
      )}

      <PlatformSuggestions taken={platforms.map((platform) => platform.name)} onPick={onAdd} />

      <CustomPlatformForm onAdd={onAdd} />
    </div>
  );
}
