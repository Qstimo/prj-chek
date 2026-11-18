import { normalizeSummaryText } from '@cairn/shared';

/**
 * Одно событие ответа `getRecognition` в части, которая нас касается.
 *
 * Поля необязательны все до одного: событий у провайдера больше, чем нас
 * интересует, и объявлять их обязательными значило бы отказываться от
 * ответа из-за служебного сообщения.
 */
interface RecognitionEvent {
  /** Текст с пунктуацией: нормализованный вариант. */
  final_refinement?: { normalized_text?: { alternatives?: { text?: unknown }[] } };
  /** Сырой текст без пунктуации. */
  final?: { alternatives?: { text?: unknown }[] };
}

/**
 * Собирает текст расшифровки из ответа службы.
 *
 * **Точный формат ответа требует живой проверки** (дизайн, пункт 4 таблицы
 * проверок), и функция написана снисходительной именно поэтому: ни одно
 * неузнанное событие, ни один неразобравшийся кусок и ни один обрыв на
 * середине не рушат разбор — берётся то, что доехало. Выдуманная строгость
 * здесь обошлась бы дороже всего: созвон уже отправлен, уже оплачен, и
 * второй попытки без второй оплаты не будет.
 *
 * Ответ `getRecognition` — **не один JSON-объект, а поток объектов**, по
 * сообщению на событие, и сообщения, по свидетельствам, бывают склеены без
 * перевода строки. Поэтому объекты читаются по балансу фигурных скобок вне
 * строковых литералов, а не делением по `\n` и не `JSON.parse` всего тела:
 * первое не нашло бы границ, второе упало бы на первом же ответе.
 *
 * Пустота — законный ответ этой функции, а не исключение: выше она
 * превращается в `transcription_empty`, потому что саммари рождается из
 * текста, и пустого `content` у записи хроники не бывает.
 */
export function transcriptOf(body: string): string {
  const refined: string[] = [];
  const raw: string[] = [];

  for (const chunk of objectsOf(body)) {
    const event = parsedOf(chunk);

    if (event === null) {
      continue;
    }

    refined.push(...textsOf(event.final_refinement?.normalized_text?.alternatives));
    raw.push(...textsOf(event.final?.alternatives));
  }

  // Нормализованный текст предпочитается сырому **целиком**, а не по
  // событию: смешать их значило бы получить один созвон, в котором
  // пунктуация есть у половины фраз.
  const pieces = refined.length > 0 ? refined : raw;

  if (pieces.length === 0) {
    return '';
  }

  try {
    // Та же функция, которой нормализуется вставленный руками текст:
    // иначе один и тот же созвон имел бы разную длину в зависимости от
    // того, как попал в систему. Пробелы и табуляции свёртываются, а
    // переводы строк остаются — они разделяют реплики, а не украшают их.
    return normalizeSummaryText(pieces.join(' ').replace(/[ \t]+/g, ' '));
  } catch {
    // `normalizeSummaryText` отвергает управляющие символы, и это верно:
    // такой текст в запись хроники не ляжет. Переспросить человека здесь
    // нечем — текст он не вводил, — поэтому честный исход тот же, что у
    // тишины в записи: пустота, то есть `transcription_empty`.
    return '';
  }
}

/**
 * Читает объекты верхнего уровня подряд, по балансу фигурных скобок.
 *
 * Скобки внутри строковых литералов не считаются, и экранированная
 * кавычка строку не закрывает: иначе `«назвали ветку {main}»` разорвало бы
 * объект посередине. Незакрытый остаток отбрасывается — провайдер оборвал
 * ответ, и взять надо то, что доехало.
 */
function objectsOf(body: string): string[] {
  const chunks: string[] = [];
  let depth = 0;
  let start = -1;
  let isInString = false;
  let isEscaped = false;

  for (let at = 0; at < body.length; at += 1) {
    const char = body[at];

    if (isInString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        isInString = false;
      }

      continue;
    }

    if (char === '"') {
      isInString = true;
    } else if (char === '{') {
      if (depth === 0) {
        start = at;
      }

      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;

      if (depth === 0 && start >= 0) {
        chunks.push(body.slice(start, at + 1));
        start = -1;
      }
    }
  }

  return chunks;
}

/** Разобранное событие либо `null`: негодный кусок пропускается. */
function parsedOf(chunk: string): RecognitionEvent | null {
  try {
    const parsed: unknown = JSON.parse(chunk);

    return typeof parsed === 'object' && parsed !== null ? (parsed as RecognitionEvent) : null;
  } catch {
    return null;
  }
}

/**
 * Непустые тексты всех вариантов события, по порядку.
 *
 * Все, а не первый: выбирать «лучший» вариант нам нечем, а терять текст
 * хуже, чем склеить. Пустые и нестроковые отбрасываются — пустой промежуток
 * в тексте созвона ничего не значит.
 */
function textsOf(alternatives: { text?: unknown }[] | undefined): string[] {
  if (!Array.isArray(alternatives)) {
    return [];
  }

  return alternatives
    .map((alternative) => (typeof alternative.text === 'string' ? alternative.text.trim() : ''))
    .filter((text) => text !== '');
}
