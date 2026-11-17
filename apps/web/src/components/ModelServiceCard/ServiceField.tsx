import type { IFieldProps } from './types';

/**
 * Строка настройки «подпись — значение».
 *
 * Отдельным компонентом, а не вёрсткой на месте: строк восемь, и
 * повторять разметку восемь раз значило бы расходиться в ней при первой
 * правке.
 */
export function ServiceField({ label, value }: IFieldProps) {
  return (
    <div className="flex flex-wrap gap-x-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
