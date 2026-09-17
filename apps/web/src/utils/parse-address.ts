import { hostnameOf, rootDomainOf } from '@cairn/shared';

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
 * `rootDomainOf` и `hostnameOf` берутся из общего пакета, а не
 * переписываются: правило корня и нормализация адреса одни на сервер
 * и на интерфейс, и разойтись им нельзя — иначе подсказка обещала бы
 * одно имя, а сохранялось бы другое.
 */
export function parseAddress(
  draft: string,
  knownRoots: string[],
  rootSuffix?: string,
): IAddressParse | null {
  const entered = hostnameOf(draft);

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
 *
 * Судьба корня договаривается только тому, кому виден реестр. Подрядчику
 * он не показывается вовсе, и «будет заведён» было бы выдумкой: корень
 * вполне может уже существовать в чужом проекте.
 */
export function rootHintOf(
  { root, isKnownRoot }: IAddressParse,
  isRegistryVisible = true,
): string {
  if (!isRegistryVisible) {
    return `Корень: ${root}`;
  }

  return `Корень: ${root} — ${isKnownRoot ? 'уже в реестре' : 'будет заведён'}`;
}
