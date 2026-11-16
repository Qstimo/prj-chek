import { normalizeSummaryText } from '@cairn/shared';

import { ALLOWED_EXTENSIONS, FILE_ERRORS, MAX_FILE_BYTES } from './constants';

/**
 * Читает текстовый файл в строку или отказывает с объяснением.
 *
 * Порядок проверок обязателен (дизайн, раздел 7.2):
 *
 * 1. **размер** — файл больше предела не читается вовсе: читать двести
 *    мегабайт, чтобы потом отказать по длине, незачем;
 * 2. **расширение** — `.txt` и `.md`. `File.type` доказательством
 *    содержимого **не считается**: его ставит операционная система по
 *    тому же расширению, и подделать его ничего не стоит;
 * 3. **декодирование** с `fatal: true` — негодная кодировка (обычная
 *    windows-1251 из старого редактора) даёт отказ с просьбой сохранить в
 *    UTF-8, а не кракозябры, которые человек отправит наружу, не заметив;
 * 4. **нормализация** той же функцией контракта, что на сервере.
 *
 * Имя файла не возвращается и никуда не уходит: ни одному экрану оно не
 * нужно, а имена файлов на машинах людей нередко говорят больше, чем
 * содержимое.
 */
export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(FILE_ERRORS.tooBig);
  }

  const name = file.name.toLowerCase();

  if (!ALLOWED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    throw new Error(FILE_ERRORS.extension);
  }

  const bytes = await bytesOf(file);

  let decoded: string;

  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(FILE_ERRORS.encoding);
  }

  // Управляющие символы — отказ нормализации, и он проходит наружу как
  // есть: подменять присланный человеком текст молча нельзя.
  return normalizeSummaryText(decoded);
}

/**
 * Байты файла через `FileReader`, а не `Blob.arrayBuffer()`.
 *
 * Причина внешняя: в jsdom у `Blob` есть только `slice`, `size` и `type`,
 * и на `arrayBuffer` тест падал бы в среде, а не в браузере. `FileReader`
 * есть и там, и там, и ведёт себя одинаково.
 */
function bytesOf(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error(FILE_ERRORS.encoding));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}
