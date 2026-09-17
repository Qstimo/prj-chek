import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LinkTitleService } from './link-title.service';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><head><title>Внутренняя страница</title></head></html>');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('чтение заголовка по ссылке', () => {
  const service = new LinkTitleService();

  it('не ходит на внутренний адрес, даже если там есть заголовок', async () => {
    // Главная проверка главы: без неё эндпоинт становится инструментом
    // разведки внутренней сети.
    await expect(service.read(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('отвергает схему, по которой ходить нельзя', async () => {
    await expect(service.read('file:///etc/passwd')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отвергает то, что не адрес', async () => {
    await expect(service.read('TASK-17')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('имя, разрешающееся в петлю, тоже отвергается', async () => {
    await expect(service.read(`http://localhost:${port}/`)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
