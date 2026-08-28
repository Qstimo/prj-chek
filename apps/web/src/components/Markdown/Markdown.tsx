import type { ReactNode } from 'react';

import { parseMarkdown, type Block, type Inline } from './parseMarkdown';

/** Пропсы рендера Markdown. */
interface IProps {
  content: string;
}

/**
 * Безопасный рендер Markdown (спека 5): блоки парсера превращаются
 * в React-элементы. `dangerouslySetInnerHTML` не используется нигде —
 * любой HTML в тексте остаётся текстом.
 */
export function Markdown({ content }: IProps) {
  return <div className="space-y-3">{parseMarkdown(content).map(renderBlock)}</div>;
}

/** Один блок документа. */
function renderBlock(block: Block, index: number): ReactNode {
  switch (block.kind) {
    case 'heading': {
      // Уровень +1: h1 страницы занят её заголовком.
      const Tag = (['h2', 'h3', 'h4'] as const)[block.level - 1]!;
      const sizes = ['text-xl font-semibold', 'text-lg font-semibold', 'font-semibold'];

      return (
        <Tag key={index} className={sizes[block.level - 1]}>
          {block.inlines.map(renderInline)}
        </Tag>
      );
    }
    case 'codeBlock':
      return (
        <pre key={index} className="overflow-x-auto rounded-md bg-muted p-3">
          <code className="text-sm">{block.text}</code>
        </pre>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';

      return (
        <Tag key={index} className={block.ordered ? 'list-decimal pl-6' : 'list-disc pl-6'}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{item.map(renderInline)}</li>
          ))}
        </Tag>
      );
    }
    case 'paragraph':
      return <p key={index}>{block.inlines.map(renderInline)}</p>;
  }
}

/** Один строчный элемент. */
function renderInline(inline: Inline, index: number): ReactNode {
  switch (inline.kind) {
    case 'text':
      return inline.text;
    case 'bold':
      return <strong key={index}>{inline.text}</strong>;
    case 'italic':
      return <em key={index}>{inline.text}</em>;
    case 'code':
      return (
        <code key={index} className="rounded bg-muted px-1 text-sm">
          {inline.text}
        </code>
      );
    case 'link':
      return (
        <a
          key={index}
          href={inline.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {inline.text}
        </a>
      );
  }
}
