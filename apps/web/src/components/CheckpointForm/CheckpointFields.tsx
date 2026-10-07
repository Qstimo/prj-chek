'use client';

import type { KeyboardEvent } from 'react';

import { FIELD_CLASS } from './constants';

/** Пропсы полей чекпоинта. */
interface IProps {
  title: string;
  url: string;
  onTitleChange: (title: string) => void;
  onUrlChange: (url: string) => void;
  /** Отправка по Ctrl+Enter: у многострочного поля Enter её не даёт. */
  onSubmitShortcut: () => void;
  onUrlBlur: () => void;
  /**
   * Различитель идентификаторов.
   *
   * Форма добавления и форма правки живут на одной панели одновременно:
   * без него два поля получили бы один `id`.
   */
  idPrefix: string;
}

/** Формулировка и ссылка на задачу. */
export function CheckpointFields({
  title,
  url,
  onTitleChange,
  onUrlChange,
  onSubmitShortcut,
  onUrlBlur,
  idPrefix,
}: IProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // С многострочным полем Enter перестаёт отправлять форму, и без этого
    // сочетания клавиатурного пути к кнопке не остаётся вовсе.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSubmitShortcut();
    }
  }

  return (
    <>
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-title`} className="block text-sm font-medium">
          Формулировка
        </label>
        <textarea
          id={`${idPrefix}-title`}
          rows={7}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className={FIELD_CLASS}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-url`} className="block text-sm font-medium">
          Ссылка на задачу
        </label>
        <input
          id={`${idPrefix}-url`}
          type="url"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          onBlur={onUrlBlur}
          className={FIELD_CLASS}
        />
      </div>
    </>
  );
}
