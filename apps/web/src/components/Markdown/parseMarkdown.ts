/**
 * Разбор минимального подмножества Markdown (спека 5).
 *
 * Чистая функция: текст → дерево блоков. Рендер в React-элементы живёт
 * отдельно; HTML здесь не возникает нигде, поэтому XSS невозможен
 * по построению, а не по фильтрации.
 */

/** Строчный элемент. */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

/** Блок документа. */
export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'codeBlock'; text: string };

/** Разбирает документ на блоки. */
export function parseMarkdown(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.trim() === '') {
      index += 1;

      continue;
    }

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index]!.startsWith('```')) {
        codeLines.push(lines[index]!);
        index += 1;
      }

      index += 1; // закрывающая ```
      blocks.push({ kind: 'codeBlock', text: codeLines.join('\n') });

      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);

    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        inlines: parseInlines(heading[2]!),
      });
      index += 1;

      continue;
    }

    if (/^-\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const pattern = ordered ? /^\d+\.\s+(.*)$/ : /^-\s+(.*)$/;
      const items: Inline[][] = [];

      while (index < lines.length) {
        const match = pattern.exec(lines[index]!);

        if (!match) {
          break;
        }

        items.push(parseInlines(match[1]!));
        index += 1;
      }

      blocks.push({ kind: 'list', ordered, items });

      continue;
    }

    // Абзац: соседние непустые строки склеиваются через пробел.
    const paragraphLines: string[] = [];

    while (
      index < lines.length &&
      lines[index]!.trim() !== '' &&
      !lines[index]!.startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[index]!) &&
      !/^-\s+/.test(lines[index]!) &&
      !/^\d+\.\s+/.test(lines[index]!)
    ) {
      paragraphLines.push(lines[index]!.trim());
      index += 1;
    }

    blocks.push({ kind: 'paragraph', inlines: parseInlines(paragraphLines.join(' ')) });
  }

  return blocks;
}

/** Разрешены только веб-ссылки: javascript: и прочее остаются текстом. */
const SAFE_HREF = /^https?:\/\//;

/** Строчные конструкции в порядке приоритета. */
const INLINE_PATTERN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/;

/** Разбирает строку на строчные элементы. */
function parseInlines(text: string): Inline[] {
  const inlines: Inline[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = INLINE_PATTERN.exec(rest);

    if (!match) {
      inlines.push({ kind: 'text', text: rest });

      break;
    }

    if (match.index > 0) {
      inlines.push({ kind: 'text', text: rest.slice(0, match.index) });
    }

    const token = match[0];

    if (token.startsWith('`')) {
      inlines.push({ kind: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('**')) {
      inlines.push({ kind: 'bold', text: token.slice(2, -2) });
    } else if (token.startsWith('*')) {
      inlines.push({ kind: 'italic', text: token.slice(1, -1) });
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;

      if (SAFE_HREF.test(link[2]!)) {
        inlines.push({ kind: 'link', text: link[1]!, href: link[2]! });
      } else {
        // Небезопасная схема не становится ссылкой — остаётся текстом.
        inlines.push({ kind: 'text', text: token });
      }
    }

    rest = rest.slice(match.index + token.length);
  }

  return inlines;
}
