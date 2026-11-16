import Link from 'next/link';

import { CODE_LABELS, DEFAULT_TITLE, GUIDE_LABELS, TONE_STYLES, WARNING_GUIDE } from './constants';
import { WarningTone, type IProps, type PanelWarning } from './types';
import { deadlineTextOf } from './utils';

/**
 * Предупреждения о сроках и авариях (ТЗ 8): именно это теряется первым,
 * когда проектов больше трёх. Пустой список не рисует ничего.
 *
 * Тон и заголовок задаются снаружи: на сводке блоков два — авария и сроки
 * требуют разных действий сегодня, — а на экране инфраструктуры три:
 * ещё и предупреждения реестров, которые видит один суперадмин.
 */
export function WarningsPanel({ warnings, title, tone = WarningTone.Attention }: IProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className={`space-y-2 rounded-md border p-4 ${TONE_STYLES[tone]}`}>
      <h2 className="text-sm font-medium">{title ?? DEFAULT_TITLE}</h2>
      <ul className="space-y-2 text-sm">
        {warnings.map((warning, index) => (
          <li key={`${warning.subject}-${warning.kind}-${index}`} data-kind={warning.kind}>
            <WarningRow warning={warning} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Строка предупреждения: что случилось, с чем и что делать.
 *
 * Фраза с сервера отвечает «что увидели», расшифровка — «чем грозит» и
 * «чьё это действие». Расшифровка под раскрытием: в списке из десяти
 * предупреждений развёрнутые объяснения прячут сами предупреждения.
 */
function WarningRow({ warning }: { warning: PanelWarning }) {
  const guide = WARNING_GUIDE[warning.kind];
  const deadline = deadlineTextOf(warning);

  return (
    <>
      <p className="font-medium">{guide.title}</p>
      <p>
        <Subject warning={warning} />: {warning.detail}
      </p>

      <details className="mt-1">
        <summary className="cursor-pointer text-muted-foreground">Подробнее</summary>
        <dl className="space-y-1 pl-4 pt-1">
          <Row label={GUIDE_LABELS.meaning} value={guide.meaning} />
          <Row label={GUIDE_LABELS.action} value={guide.action} />
          <Row
            label={GUIDE_LABELS.code}
            value={warning.code === undefined ? null : CODE_LABELS[warning.code]}
          />
          <Row label={GUIDE_LABELS.deadline} value={deadline} />
        </dl>
      </details>
    </>
  );
}

/** Предмет предупреждения: ссылка на проект, если адрес известен. */
function Subject({ warning }: { warning: PanelWarning }) {
  if (!warning.href) {
    return <span className="font-medium">{warning.subject}</span>;
  }

  return (
    <Link href={warning.href} className="font-medium hover:underline">
      {warning.subject}
    </Link>
  );
}

/** Строка расшифровки. Пустое значение не рисуется вовсе. */
function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
