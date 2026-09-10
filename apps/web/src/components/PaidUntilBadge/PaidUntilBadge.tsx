import { STATE_STYLES } from './constants';
import type { IProps } from './types';
import { paidUntilView } from './utils';

/** Срок оплаты сервера: дата, остаток и просрочка (спека этапа 9, раздел 7). */
export function PaidUntilBadge({ paidUntil }: IProps) {
  const view = paidUntilView(paidUntil, new Date());

  return (
    <span
      data-testid="paid-until"
      data-state={view.state}
      className={`text-sm ${STATE_STYLES[view.state]}`}
    >
      {view.text}
    </span>
  );
}
