import { Module } from '@nestjs/common';

import { LinkTitleService } from './link-title.service';

/**
 * Чтение заголовка чужой страницы.
 *
 * Отдельный модуль, а не часть роадмапа: поход наружу — забота, не имеющая
 * отношения к секции, и держать её рядом с проверками адреса честнее, чем
 * растворять в сервисе роадмапа.
 */
@Module({
  providers: [LinkTitleService],
  exports: [LinkTitleService],
})
export class LinkTitleModule {}
