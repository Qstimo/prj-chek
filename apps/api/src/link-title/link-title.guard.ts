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

/** Ведёт ли IPv4-адрес внутрь сети. */
function isPrivateIPv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number) as [number, number, number, number];

  return (
    a === 0 || // 0.0.0.0/8 — «этот хост»
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 — петля
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 — операторский NAT
    (a === 169 && b === 254) || // 169.254.0.0/16 — link-local и метаданные
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a >= 224 // 224.0.0.0/4 и выше — групповая рассылка, резерв, широковещательный
  );
}

/**
 * Раскладывает IPv6-адрес на восемь 16-битных групп.
 *
 * Разбирать нужно весь адрес, а не его начало: у строки, открывающейся с
 * `::`, первая группа пуста, и проверка по началу пропускала и петлю, и
 * метаданные облака, записанные как `::ffff:169.254.169.254`.
 *
 * Отдаёт `null`, если разобрать не удалось.
 */
function groupsOf(address: string): number[] | null {
  const halves = address.split('::');

  if (halves.length > 2) {
    return null;
  }

  const expand = (part: string): number[] => {
    if (part.length === 0) {
      return [];
    }

    const chunks = part.split(':');
    const last = chunks.at(-1) ?? '';

    // Хвостовой IPv4 (`::ffff:127.0.0.1`) занимает две последние группы.
    if (last.includes('.')) {
      const [a, b, c, d] = last.split('.').map(Number) as [number, number, number, number];

      return [
        ...chunks.slice(0, -1).map((chunk) => Number.parseInt(chunk, 16)),
        (a << 8) | b,
        (c << 8) | d,
      ];
    }

    return chunks.map((chunk) => Number.parseInt(chunk, 16));
  };

  const head = expand(halves[0] ?? '');

  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }

  const tail = expand(halves[1] ?? '');
  const gap = 8 - head.length - tail.length;

  if (gap < 0) {
    return null;
  }

  return [...head, ...(Array<number>(gap).fill(0) as number[]), ...tail];
}

/**
 * Достаёт IPv4, запакованный в IPv6, — именно тот адрес, по которому пойдёт
 * запрос.
 *
 * Форм три: `::ffff:a.b.c.d` (отображённый), `::a.b.c.d` (устаревший
 * совместимый) и `64:ff9b::a.b.c.d` (трансляция NAT64). Все три доходят до
 * того же узла, что и голый IPv4, поэтому и проверяться должны его списком.
 */
function embeddedIPv4Of(groups: number[]): string | null {
  const isWrapped = groups.slice(0, 5).every((group) => group === 0);
  const isTranslated =
    groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0);

  if (!isWrapped && !isTranslated) {
    return null;
  }

  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;

  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
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
    return isPrivateIPv4(address);
  }

  if (!isIPv6(address)) {
    // Не адрес вовсе: разрешать такое нельзя — вдруг это имя, которое
    // где-то дальше разрешится во что угодно.
    return true;
  }

  const groups = groupsOf(address.toLowerCase());

  if (!groups) {
    // Разобрать не вышло: отказать дешевле, чем пропустить непонятое.
    return true;
  }

  const embedded = embeddedIPv4Of(groups);

  if (embedded) {
    // Сюда же попадают `::` и `::1`: как IPv4 это 0.0.0.0 и 0.0.0.1,
    // и оба отсекает 0.0.0.0/8.
    return isPrivateIPv4(embedded);
  }

  const first = groups[0] ?? 0;

  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 — уникальные локальные
    (first & 0xffc0) === 0xfe80 // fe80::/10 — link-local
  );
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
