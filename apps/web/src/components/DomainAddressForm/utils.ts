import { rootDomainOf } from '@cairn/shared';

/** Разбор введённого адреса: что за имя и чем ему приходится корень. */
export interface IAddressParse {
  /** Полное имя в том виде, в каком его сохранит сервер. */
  name: string;
  /** Корень, за который платят. */
  root: string;
  /** Введён сам корень, а не растущий из него адрес. */
  isRoot: boolean;
  /** Корень уже заведён в реестре. */
  isKnownRoot: boolean;
}

/**
 * Разбирает введённое пользователем в адрес и его корень.
 *
 * `rootDomainOf` берётся из общего пакета, а не переписывается: правило
 * корня одно на сервер и на интерфейс, и разойтись им нельзя.
 *
 * Приведение к нижнему регистру повторяет серверное: человек должен
 * видеть ровно то, что будет сохранено.
 */
export function parseAddress(
  draft: string,
  knownRoots: string[],
  rootSuffix?: string,
): IAddressParse | null {
  const entered = draft.trim().toLowerCase();

  if (entered.length === 0) {
    return null;
  }

  const name = rootSuffix ? `${entered}.${rootSuffix}` : entered;
  // Зафиксированный корень назвала карточка, на которой стоит форма:
  // пересчитывать его по имени значило бы спорить с этим выбором.
  const root = rootSuffix ?? rootDomainOf(name);

  return { name, root, isRoot: root === name, isKnownRoot: knownRoots.includes(root) };
}

/**
 * Строка разбора под полем адреса.
 *
 * Правило корня до сих пор работало молча, и именно это делало его
 * невидимым: человек не понимал, почему `api.example.com` в реестр нельзя.
 */
export function rootHintOf({ root, isKnownRoot }: IAddressParse): string {
  return `Корень: ${root} — ${isKnownRoot ? 'уже в реестре' : 'будет заведён'}`;
}
