'use client';

import { useEffect, useState } from 'react';

/**
 * Бросок файла на страницу целиком.
 *
 * Слушает `window`, а не свою область, по двум причинам. Первая: «на
 * страницу» и значит на страницу — бросок в отступ сбоку от списка
 * обязан работать так же, как бросок в список, иначе человек целится.
 * Вторая: умолчание браузера на брошенный файл — **открыть его вместо
 * страницы**, и отменять его нужно у всех событий, а не только у тех,
 * что попали в нашу область. Поэтому умолчание отменяется всегда, и
 * `isEnabled` гасит лишь передачу файла дальше.
 *
 * Возвращает признак «файл тащат над страницей»: без видимой подсказки
 * бросок остаётся угаданной возможностью, о которой никто не знает.
 */
export function useFileDrop(onFile: (file: File) => void, isEnabled = true): boolean {
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    function over(event: DragEvent): void {
      event.preventDefault();
      // Тащат ли файл, а не выделенный на странице текст: подсказка про
      // файл над перетаскиваемым словом обещала бы не то, что будет.
      setIsOver(isEnabled && event.dataTransfer?.types.includes('Files') === true);
    }

    function leave(event: DragEvent): void {
      // `relatedTarget === null` — курсор ушёл за окно; при переходе
      // между элементами внутри страницы `dragleave` приходит тоже, и
      // гасить подсказку на нём значило бы мигать ею на каждой границе.
      if (event.relatedTarget === null) {
        setIsOver(false);
      }
    }

    function drop(event: DragEvent): void {
      event.preventDefault();
      setIsOver(false);

      const file = event.dataTransfer?.files[0];

      if (isEnabled && file !== undefined) {
        onFile(file);
      }
    }

    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);

    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [onFile, isEnabled]);

  return isOver;
}
