import { SUGGESTER_DISABLED, ModelServicePlacement } from '@cairn/shared';

import { DEFAULT_SUGGESTER_MAX_CHARS } from './settings';
import { SuggesterFailure, type SuggestResult, type TaskSuggester } from './task-suggester';

/**
 * Порт выключен: разбивка не настроена (дизайн, раздел 5.2).
 *
 * Нужен, потому что система self-hosted и обязана работать без внешних
 * зависимостей: установка, где разбивка не настроена, показывает
 * выключенную кнопку с объяснением, а не падает. Текст при этом
 * сохраняется, задачи набираются руками, релиз формируется — выключенная
 * установка остаётся полностью рабочей.
 *
 * В сеть не ходит ни при каких условиях: это и проверяется тестом.
 */
export class DisabledSuggester implements TaskSuggester {
  readonly placement = ModelServicePlacement.External;
  readonly model = '';
  /** Называть узел, куда ничего не уходит, значило бы врать. */
  readonly host = null;
  /** Предел нужен и выключенному: по нему форма считает запас объёма. */
  readonly maxChars = DEFAULT_SUGGESTER_MAX_CHARS;
  readonly isEnabled = false;

  /** Аргументы объявлены, но не читаются: текст наружу не уходит вовсе. */
  async suggest(_text: string, _signal: AbortSignal): Promise<SuggestResult> {
    throw new SuggesterFailure(
      SUGGESTER_DISABLED,
      'Разбивка не настроена: обратитесь к администратору.',
    );
  }
}
