/** Что нужно знать, чтобы решить, идти ли за заголовком. */
interface IReadArgs {
  /** Содержимое поля ссылки как есть, вместе с пробелами. */
  url: string;
  /** Текущая формулировка: написанное руками важнее прочитанного. */
  title: string;
  onReadTitle?: (url: string) => Promise<string | null>;
}

/**
 * Заголовок задачи для подстановки — либо `null`, если подставлять нечего.
 *
 * Условий отказа три, и все три означают «не трогай поле»: читать некому,
 * ссылки нет, формулировка уже написана. Сорвавшееся чтение попадает сюда же:
 * подстановка — удобство, а не обязанность, и ссылка остаётся годной сама
 * по себе, даже если заголовок прочитать не вышло.
 */
export async function readLinkTitle({ url, title, onReadTitle }: IReadArgs): Promise<string | null> {
  const candidate = url.trim();

  if (!onReadTitle || candidate.length === 0 || title.trim().length > 0) {
    return null;
  }

  return onReadTitle(candidate).catch(() => null);
}
