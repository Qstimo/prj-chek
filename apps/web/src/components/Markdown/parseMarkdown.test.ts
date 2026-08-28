import { describe, expect, it } from 'vitest';

import { parseMarkdown } from './parseMarkdown';

describe('parseMarkdown', () => {
  it('разбирает заголовки трёх уровней', () => {
    expect(parseMarkdown('# Один\n## Два\n### Три')).toEqual([
      { kind: 'heading', level: 1, inlines: [{ kind: 'text', text: 'Один' }] },
      { kind: 'heading', level: 2, inlines: [{ kind: 'text', text: 'Два' }] },
      { kind: 'heading', level: 3, inlines: [{ kind: 'text', text: 'Три' }] },
    ]);
  });

  it('четыре решётки — обычный абзац', () => {
    const [block] = parseMarkdown('#### не заголовок');

    expect(block!.kind).toBe('paragraph');
  });

  it('разбирает маркированный и нумерованный списки', () => {
    expect(parseMarkdown('- один\n- два')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'один' }], [{ kind: 'text', text: 'два' }]],
      },
    ]);
    expect(parseMarkdown('1. раз\n2. два')[0]).toMatchObject({ kind: 'list', ordered: true });
  });

  it('кодовый блок сохраняет строки и не разбирает инлайны', () => {
    expect(parseMarkdown('```\npnpm install\n**не жирный**\n```')).toEqual([
      { kind: 'codeBlock', text: 'pnpm install\n**не жирный**' },
    ]);
  });

  it('разбирает строчный код, жирный и курсив в абзаце', () => {
    expect(parseMarkdown('запусти `pnpm dev` и **жди** *чуда*')).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'text', text: 'запусти ' },
          { kind: 'code', text: 'pnpm dev' },
          { kind: 'text', text: ' и ' },
          { kind: 'bold', text: 'жди' },
          { kind: 'text', text: ' ' },
          { kind: 'italic', text: 'чуда' },
        ],
      },
    ]);
  });

  it('разбирает http-ссылку', () => {
    expect(parseMarkdown('см. [доку](https://example.com/doc)')).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'text', text: 'см. ' },
          { kind: 'link', text: 'доку', href: 'https://example.com/doc' },
        ],
      },
    ]);
  });

  it('javascript-ссылка остаётся текстом', () => {
    const [block] = parseMarkdown('[клик](javascript:alert(1))');

    expect(JSON.stringify(block)).not.toContain('"kind":"link"');
    expect(JSON.stringify(block)).toContain('клик');
  });

  it('пустые строки разделяют абзацы', () => {
    const blocks = parseMarkdown('первый\n\nвторой');

    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.kind === 'paragraph')).toBe(true);
  });

  it('соседние строки склеиваются в один абзац', () => {
    const blocks = parseMarkdown('строка раз\nстрока два');

    expect(blocks).toHaveLength(1);
  });
});
