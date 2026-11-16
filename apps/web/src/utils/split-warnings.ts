import { StatusWarningKind, type StatusSummaryRow, type StatusWarning } from '@cairn/shared';

/** Предупреждение сводки: к чему относится и куда вести по клику. */
export interface LinkedWarning extends StatusWarning {
  /** Адрес секции «Инфраструктура» проекта. */
  href: string;
}

/** Предупреждения, разложенные по срочности. */
export interface SplitWarnings<W extends StatusWarning = LinkedWarning> {
  /** Проект не отвечает — действовать сейчас. */
  critical: W[];
  /** Сроки и ошибки проверок — действовать на неделе. */
  attention: W[];
}

/**
 * Виды, требующие действия сейчас.
 *
 * Список, а не одно значение: истёкший сертификат тоже закрывает доступ, и
 * когда его решат считать аварией, правка будет здесь, а не в двух местах.
 * Пока в нём ровно одно падение — наблюдаемая недоступность.
 */
const CRITICAL_KINDS: StatusWarningKind[] = [StatusWarningKind.HealthDown];

/**
 * Делит предупреждения на два списка по срочности.
 *
 * Ядро на самих предупреждениях, а не на сводке проектов: то же деление
 * нужно экрану одного проекта, где сводки нет вовсе, и второе правило
 * «что считать аварией» разошлось бы с первым.
 *
 * Обобщено по типу предупреждения: ссылка, которую дописывает сводка,
 * обязана доехать до панели нетронутой.
 */
export function splitWarnings<W extends StatusWarning>(warnings: W[]): SplitWarnings<W> {
  return {
    critical: warnings.filter((warning) => CRITICAL_KINDS.includes(warning.kind)),
    attention: warnings.filter((warning) => !CRITICAL_KINDS.includes(warning.kind)),
  };
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
  return splitWarnings<LinkedWarning>(
    rows.flatMap((row) =>
      row.warnings.map((warning) => ({
        ...warning,
        subject: `${row.projectName} · ${warning.subject}`,
        href: `/projects/${row.projectId}/infrastructure`,
      })),
    ),
  );
}
