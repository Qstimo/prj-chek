'use client';

import { tagSlug } from '@cairn/shared';
import { useState } from 'react';

import { MAX_TAGS, MAX_TAG_LENGTH } from './constants';
import type { IProps } from './types';

/**
 * Поле тегов проекта: чипы, подсказки и своё название.
 *
 * Отдаёт родителю весь набор: панель создания складывает его в своё
 * состояние и отправляет вместе с проектом, панель правки вызывает
 * мутацию сразу — как чипы платформ.
 *
 * Подтверждения снятие не спрашивает, в отличие от платформы: за тегом
 * ничего не стоит — ни выпусков, ни привязок, — и вернуть его стоит
 * одного клика.
 */
export function TagsField({ tags, onChange, suggestions = [] }: IProps) {
  const [draft, setDraft] = useState('');

  const taken = new Set(tags.map(tagSlug));
  const isFull = tags.length >= MAX_TAGS;

  function add(label: string): void {
    const trimmed = label.trim();

    // Повтор, различимый только регистром, тоже повтор: сервер сведёт
    // «Web» и «web» к одному тегу и отвергнет набор целиком.
    if (trimmed.length === 0 || isFull || taken.has(tagSlug(trimmed))) {
      return;
    }

    onChange([...tags, trimmed]);
    setDraft('');
  }

  const available = suggestions.filter((label) => !taken.has(tagSlug(label)));

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Теги</span>

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {tags.map((label) => (
            <li
              key={tagSlug(label)}
              className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1"
            >
              <span className="text-sm">{label}</span>
              <button
                type="button"
                aria-label={`Убрать ${label}`}
                onClick={() => onChange(tags.filter((item) => item !== label))}
                className="text-sm text-muted-foreground"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && !isFull && (
        <div className="flex flex-wrap gap-2">
          {available.map((label) => (
            <button
              key={tagSlug(label)}
              type="button"
              onClick={() => add(label)}
              className="rounded-full border border-dashed px-2.5 py-1 text-sm text-muted-foreground opacity-70"
            >
              {`+ ${label}`}
            </button>
          ))}
        </div>
      )}

      {/* Не `<form>` и не отправка по Enter: поле живёт слотом внутри
          формы проекта, и Enter здесь отправил бы её целиком. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="tag-label" className="block text-sm font-medium">
            Свой тег
          </label>
          <input
            id="tag-label"
            value={draft}
            maxLength={MAX_TAG_LENGTH}
            disabled={isFull}
            onChange={(event) => setDraft(event.target.value)}
            className="rounded-md border border-border px-3 py-2"
          />
        </div>

        <button
          type="button"
          onClick={() => add(draft)}
          disabled={isFull}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Добавить тег
        </button>
      </div>

      {isFull && (
        <p className="text-sm text-muted-foreground">
          Больше {MAX_TAGS} тегов у проекта не бывает.
        </p>
      )}
    </div>
  );
}
