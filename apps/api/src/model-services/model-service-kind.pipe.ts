import { ModelServiceKind } from '@cairn/shared';
import { Injectable, NotFoundException, type PipeTransform } from '@nestjs/common';

/**
 * Разбирает `:kind` в значение перечня узлов.
 *
 * Отказ — `404`, а не `400`: адрес `/model-services/pochta` указывает на
 * узел, которого нет, и это ровно то, о чём говорит `404`. `400` сообщал
 * бы, что запрос негоден, тогда как негоден сам адрес.
 *
 * Не `ZodValidationPipe`: та отвечает `400` — верно для тела, неверно для
 * пути.
 */
@Injectable()
export class ModelServiceKindPipe implements PipeTransform<string, ModelServiceKind> {
  transform(value: string): ModelServiceKind {
    const kinds: string[] = Object.values(ModelServiceKind);

    if (!kinds.includes(value)) {
      throw new NotFoundException('Такой службы модели нет.');
    }

    return value as ModelServiceKind;
  }
}
