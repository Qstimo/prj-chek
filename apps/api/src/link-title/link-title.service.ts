import { lookup } from 'node:dns/promises';

import { BadRequestException, Injectable } from '@nestjs/common';

import { MAX_BODY_BYTES, MAX_REDIRECTS, REQUEST_TIMEOUT_MS } from './constants';
import { assertPublicAddress, assertPublicScheme, extractTitle } from './link-title.guard';

/**
 * Чтение заголовка чужой страницы.
 *
 * Браузер сделать этого не может — CORS закроет, — поэтому за `<title>`
 * ходит сервер. Это и делает эндпоинт опасным: он идёт по адресу, который
 * назвал пользователь. Отсюда проверки на каждом шаге, включая каждый
 * редирект: публичное имя, отвечающее перенаправлением на `127.0.0.1`,
 * иначе прошло бы насквозь.
 *
 * Неудача чтения — это `null`, а не исключение: подстановка заголовка
 * удобство, а не обязанность. Исключение остаётся только за отказом идти
 * по адресу — о нём пользователю сказать надо.
 */
@Injectable()
export class LinkTitleService {
  /** Возвращает заголовок страницы либо `null`, если прочитать не вышло. */
  async read(candidate: string): Promise<string | null> {
    let url = this.parse(candidate);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await this.assertReachable(url);

      const response = await this.request(url);

      if (response === null) {
        return null;
      }

      const location = this.redirectOf(response);

      if (!location) {
        return extractTitle(await this.readBody(response));
      }

      url = this.parse(new URL(location, url).toString());
    }

    return null;
  }

  /** Разбирает адрес и отвергает схемы, по которым ходить нельзя. */
  private parse(candidate: string): URL {
    let url: URL;

    try {
      url = new URL(candidate);
    } catch {
      throw new BadRequestException('Это не адрес');
    }

    assertPublicScheme(url);

    return url;
  }

  /** Отвергает имя, разрешающееся во внутреннюю сеть. */
  private async assertReachable(url: URL): Promise<void> {
    let addresses: { address: string }[];

    try {
      addresses = await lookup(url.hostname, { all: true });
    } catch {
      throw new BadRequestException('Имя не разрешается');
    }

    // Отвергаем, если внутренним оказался хотя бы один адрес: имя с двумя
    // записями, одна из которых петля, — способ обойти проверку.
    for (const { address } of addresses) {
      assertPublicAddress(address);
    }
  }

  /** Делает запрос с таймаутом; сетевая неудача — `null`, а не исключение. */
  private async request(url: URL): Promise<Response | null> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, {
        redirect: 'manual',
        signal: abort.signal,
        headers: { accept: 'text/html' },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Адрес перехода, если ответ — редирект. */
  private redirectOf(response: Response): string | null {
    if (response.status < 300 || response.status >= 400) {
      return null;
    }

    return response.headers.get('location');
  }

  /** Читает тело до предела, не дожидаясь конца бесконечного ответа. */
  private async readBody(response: Response): Promise<string> {
    const reader = response.body?.getReader();

    if (!reader) {
      return '';
    }

    const chunks: Uint8Array[] = [];
    let size = 0;

    while (size < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      size += value.byteLength;
    }

    await reader.cancel().catch(() => undefined);

    return new TextDecoder().decode(concat(chunks, Math.min(size, MAX_BODY_BYTES)));
  }
}

/** Склеивает прочитанные куски в один буфер нужной длины. */
function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const merged = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    const room = size - offset;

    if (room <= 0) {
      break;
    }

    merged.set(chunk.subarray(0, room), offset);
    offset += Math.min(chunk.byteLength, room);
  }

  return merged;
}
