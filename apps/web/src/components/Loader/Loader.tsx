interface IProps {
  label?: string;
  size?: 'compact' | 'page';
}

/** Общий индикатор ожидания с фирменным енотом. */
export function Loader({ label = 'Загрузка…', size = 'compact' }: IProps) {
  return (
    <div role="status" aria-live="polite" className={`cairn-loader cairn-loader--${size}`}>
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
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
