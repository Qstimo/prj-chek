/** Пропсы иконки. */
interface IProps {
  className?: string;
}

/**
 * Стрелка вниз: своя у контрола выбора вместо системной.
 *
 * Компонентом, а не файлом `.svg`: загрузчика SVG в сборке нет, а импорт
 * файла дал бы адрес картинки, который нечем покрасить под тему.
 * `currentColor` и `aria-hidden` — иконка декоративная, смысл несёт подпись.
 */
export function ChevronDownIcon({ className }: IProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 6.5 8 10.5 12 6.5" />
    </svg>
  );
}
