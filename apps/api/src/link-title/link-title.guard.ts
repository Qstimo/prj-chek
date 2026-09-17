import { isIPv4, isIPv6 } from 'node:net';

import { BadRequestException } from '@nestjs/common';

/**
 * Схемы, по которым сервер готов ходить.
 *
 * Всё остальное — `file:`, `gopher:`, `ftp:` — либо читает локальный диск,
 * либо не даёт заголовка, ради которого запрос затевался.
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/** Предел формулировки чекпоинта: длиннее подставлять некуда. */
const TITLE_LIMIT = 300;

/** Сущности, встречающиеся в заголовках чаще прочих. */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Отвергает схему, по которой ходить нельзя. */
export function assertPublicScheme(url: URL): void {
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new BadRequestException('Поддерживаются только адреса http и https');
  }
}

/** Отвергает адрес, ведущий внутрь сети. */
export function assertPublicAddress(address: string): void {
  if (isPrivateAddress(address)) {
    throw new BadRequestException('Адрес ведёт во внутреннюю сеть');
  }
}

/**
 * Ведёт ли адрес внутрь сети.
 *
 * Список закрытый и намеренно широкий: эндпоинт ходит по адресу, который
 * назвал пользователь, и без этой проверки он становится инструментом
 * разведки внутренней сети. `169.254.169.254` — адрес метаданных облачных
 * провайдеров, классическая цель такой подмены.
 */
export function isPrivateAddress(address: string): boolean {
  if (isIPv4(address)) {
    const [a, b] = address.split('.').map(Number) as [number, number, number, number];

    return (
      a === 0 || // 0.0.0.0/8 — «этот хост»
      a === 10 || // 10.0.0.0/8
      a === 127 || // 127.0.0.0/8 — петля
      (a === 169 && b === 254) || // 169.254.0.0/16 — link-local и метаданные
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) // 192.168.0.0/16
    );
  }

  if (!isIPv6(address)) {
    // Не адрес вовсе: разрешать такое нельзя — вдруг это имя, которое
    // где-то дальше разрешится во что угодно.
    return true;
  }

  const normalized = address.toLowerCase();

  if (normalized === '::1' || normalized === '::') {
    return true;
  }

  const head = normalized.split(':')[0] ?? '';

  // fc00::/7 — уникальные локальные, fe80::/10 — link-local.
  return head.startsWith('fc') || head.startsWith('fd') || head.startsWith('fe8');
}

/**
 * Достаёт заголовок страницы из разметки.
 *
 * Разбор регулярным выражением, а не парсером: нужен один тег из первых
 * килобайт документа, и тянуть ради этого зависимость незачем.
 */
export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  if (!match?.[1]) {
    return null;
  }

  const decoded = match[1].replace(
    /&(amp|lt|gt|quot|#39|apos|nbsp);/gi,
    (entity) => ENTITIES[entity.toLowerCase()] ?? entity,
  );

  const collapsed = decoded.replace(/\s+/g, ' ').trim();

  return collapsed.length > 0 ? collapsed.slice(0, TITLE_LIMIT) : null;
}
