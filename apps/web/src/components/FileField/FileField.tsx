'use client';

import { useState, type ChangeEvent, type DragEvent } from 'react';

import { FILE_FIELD_TEXTS } from './constants';
import type { IProps } from './types';

/**
 * Файловое поле: кнопка, область броска и подпись о пределах.
 *
 * Нативная кнопка `<input type="file">` осталась под подписью, а не ушла
 * вовсе: диалог выбора открывает только она, а её вид задаёт браузер, и в
 * тёмной теме системная серая кнопка с именем файла рядом выглядит чужой.
 * Поэтому поле спрятано для глаз (`sr-only`) и остаётся на месте для
 * читалок и клавиатуры — связь с подписью по `id` не теряется.
 *
 * Бросок файла — не украшение: запись созвона человек берёт из папки
 * выгрузки, и путь «перетащил» короче пути «нажал, нашёл, выбрал» ровно
 * на диалог. Проверки у броска те же, что у выбора: обработчик один
 * (см. {@link IProps.onFile}).
 */
export function FileField({ id, label, accept, hint, onFile, isDisabled = false, picked }: IProps) {
  const [isOver, setIsOver] = useState(false);

  function take(file: File | undefined): void {
    if (file !== undefined && !isDisabled) {
      onFile(file);
    }
  }

  function choose(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];

    // Поле сбрасывается сразу: иначе выбор того же файла второй раз не
    // поднимает события, и кнопка выглядела бы мёртвой.
    event.target.value = '';
    take(file);
  }

  function drop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    // Бросок на поле панели не должен доходить до экрана: тот откроет
    // вторую панель на тот же файл.
    event.stopPropagation();
    setIsOver(false);
    take(event.dataTransfer.files[0]);
  }

  function over(event: DragEvent<HTMLDivElement>): void {
    // Без отмены умолчания браузер откроет файл вместо броска, а
    // `drop` не придёт вовсе.
    event.preventDefault();
    setIsOver(true);
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>

      <div
        onDragOver={over}
        onDragLeave={() => setIsOver(false)}
        onDrop={drop}
        className={`flex flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center transition ${
          isOver ? 'border-border-strong bg-muted/60' : 'border-border bg-muted/20'
        } ${isDisabled ? 'opacity-50' : ''}`}
      >
        {/*
          Кнопка — подпись того же поля: нажатие на `<label>` открывает
          диалог, и своего обработчика клика для этого не нужно вовсе.
        */}
        <label
          htmlFor={id}
          className={`rounded-md border border-border bg-surface px-3 py-1.5 text-sm ${
            isDisabled ? 'cursor-not-allowed' : 'cursor-pointer hover:border-border-strong'
          }`}
        >
          {FILE_FIELD_TEXTS.choose}
        </label>
        <span className="text-xs text-muted-foreground">{FILE_FIELD_TEXTS.drop}</span>

        <input
          id={id}
          type="file"
          accept={accept}
          disabled={isDisabled}
          onChange={choose}
          className="sr-only"
        />
      </div>

      <p className="text-xs text-muted-foreground">{hint}</p>
      {picked !== undefined && <p className="text-xs font-medium">{picked}</p>}
    </div>
  );
}
