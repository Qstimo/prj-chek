interface IProps {
  label?: string;
  size?: 'compact' | 'page';
}

/**
 * Класс размера — полными литералами, а не склейкой `cairn-loader--${size}`.
 *
 * Tailwind сканирует исходники по тексту и выбрасывает из `@layer
 * components` всё, чего в них дословно не нашёл. Склеенного имени в тексте
 * нет ни разу, поэтому правило `.cairn-loader--page` из сборки вырезалось —
 * а соседнее `.cairn-loader--page .cairn-loader__mark` оставалось, потому
 * что `cairn-loader__mark` в исходниках есть. Енот из-за этого становился
 * крупным, как и задумано, но всё остальное — высота и центрирование —
 * молча не применялось.
 */
const SIZE_CLASS: Record<NonNullable<IProps['size']>, string> = {
  compact: '',
  page: 'cairn-loader--page',
};

/** Общий индикатор ожидания с фирменным енотом. */
export function Loader({ label = 'Загрузка…', size = 'compact' }: IProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`cairn-loader ${SIZE_CLASS[size]}`.trim()}
    >
      <span className="cairn-loader__mark" aria-hidden="true">
        <img
          src="/cairn-raccoon.png"
          alt=""
          width={64}
          height={64}
          className="cairn-loader__face cairn-loader__face--base"
        />
        <img
          src="/cairn-raccoon.png"
          alt=""
          width={64}
          height={64}
          className="cairn-loader__face cairn-loader__face--fill"
        />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
