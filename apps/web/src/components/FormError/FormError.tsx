import type { IProps } from './types';

/**
 * Сообщение об отказе над кнопкой отправки.
 *
 * Отдельный компонент, потому что форм в системе полтора десятка, и каждая
 * обязана говорить, почему не получилось: молчащая форма выглядит как
 * «ничего не произошло», и человек жмёт кнопку снова.
 *
 * `role="alert"` не украшение: без него читающие с экрана узнают об отказе,
 * только наткнувшись на текст.
 */
export function FormError({ message }: IProps) {
  if (!message) {
    return null;
  }

  return (
    <p role="alert" className="whitespace-pre-line text-sm text-destructive">
      {message}
    </p>
  );
}
