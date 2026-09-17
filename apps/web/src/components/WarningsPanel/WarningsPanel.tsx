import Link from 'next/link';

import { DEFAULT_TITLE, TONE_STYLES } from './constants';
import { WarningTone, type IProps, type PanelWarning } from './types';

/**
 * Предупреждения о сроках и авариях (ТЗ 8): именно это теряется первым,
 * когда проектов больше трёх. Пустой список не рисует ничего.
 *
 * Тон и заголовок задаются снаружи: на сводке блоков два — авария и сроки
 * требуют разных действий сегодня, — а на экране инфраструктуры один.
 */
export function WarningsPanel({ warnings, title, tone = WarningTone.Attention }: IProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className={`space-y-1 rounded-md border p-4 ${TONE_STYLES[tone]}`}>
      <h2 className="text-sm font-medium">{title ?? DEFAULT_TITLE}</h2>
      <ul className="space-y-0.5 text-sm">
        {warnings.map((warning, index) => (
          <li key={`${warning.subject}-${warning.kind}-${index}`}>
            <WarningRow warning={warning} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Строка предупреждения: ссылка на проект, если адрес известен. */
function WarningRow({ warning }: { warning: PanelWarning }) {
  const body = (
    <>
      <span className="font-medium">{warning.subject}</span>: {warning.detail}
    </>
  );

  if (!warning.href) {
    return body;
  }

  return (
    <Link href={warning.href} className="hover:underline">
      {body}
    </Link>
  );
}
