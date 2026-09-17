import type { IProps } from './types';

/**
 * Имя поддомена с приглушённым корнем.
 *
 * В дереве реестра корень повторяется в каждой строке, и глазу нужна
 * различающаяся часть — левая. Приглушается оформлением, а не обрезкой:
 * адрес остаётся копируемым целиком, между частями нет ничего, кроме
 * самих символов имени.
 */
export function SubdomainName({ name, root }: IProps) {
  const suffix = `.${root}`;

  if (!name.endsWith(suffix)) {
    // Имя корня и имя чужой зоны показываются как есть: резать по
    // случайному совпадению хуже, чем не резать вовсе.
    return <span>{name}</span>;
  }

  return (
    <span>
      {name.slice(0, -root.length)}
      <span className="text-muted-foreground">{root}</span>
    </span>
  );
}
