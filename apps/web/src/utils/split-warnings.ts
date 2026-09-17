import { StatusWarningKind, type StatusSummaryRow, type StatusWarning } from '@cairn/shared';

/** Предупреждение сводки: к чему относится и куда вести по клику. */
export interface LinkedWarning extends StatusWarning {
  /** Адрес секции «Инфраструктура» проекта. */
  href: string;
}

/** Предупреждения, разложенные по срочности. */
export interface SplitWarnings {
  /** Проект не отвечает — действовать сейчас. */
  critical: LinkedWarning[];
  /** Сроки и ошибки проверок — действовать на неделе. */
  attention: LinkedWarning[];
}

/**
 * Раскладывает предупреждения сводки на два списка по срочности.
 *
 * Упавший прод и домен, который надо продлить через три недели, требуют
 * разных действий сегодня, и в одном списке первое теряется среди второго.
 *
 * Идентификатор проекта сохраняется в ссылке: раньше он терялся при склейке
 * имени с предметом, и строка предупреждения никуда не вела.
 */
export function splitWarningsByUrgency(rows: StatusSummaryRow[]): SplitWarnings {
  const linked: LinkedWarning[] = rows.flatMap((row) =>
    row.warnings.map((warning) => ({
      ...warning,
      subject: `${row.projectName} · ${warning.subject}`,
      href: `/projects/${row.projectId}/infrastructure`,
    })),
  );

  return {
    critical: linked.filter((warning) => warning.kind === StatusWarningKind.HealthDown),
    attention: linked.filter((warning) => warning.kind !== StatusWarningKind.HealthDown),
  };
}
