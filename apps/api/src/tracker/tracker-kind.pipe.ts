import { TrackerKind } from '@cairn/shared';
import { Injectable, NotFoundException, type PipeTransform } from '@nestjs/common';

/**
 * Разбирает `:kind` в значение перечня трекеров.
 *
 * Отказ — `404`, а не `400`, по тому же правилу, что у
 * `ModelServiceKindPipe`: адрес `/tracker-connections/jira` указывает на
 * трекер, которого нет, и это ровно то, о чём говорит `404`. `400` сообщал
 * бы, что негоден запрос, тогда как негоден сам адрес.
 *
 * Не `ZodValidationPipe`: та отвечает `400` — верно для тела, неверно для
 * пути.
 */
@Injectable()
export class TrackerKindPipe implements PipeTransform<string, TrackerKind> {
  transform(value: string): TrackerKind {
    const kinds: string[] = Object.values(TrackerKind);

    if (!kinds.includes(value)) {
      throw new NotFoundException('Такого трекера нет.');
    }

    return value as TrackerKind;
  }
}
