import type {
  CarriedOutCheckpoint,
  PublicLink,
  PublicReleaseReport,
  ReleaseReport,
  ReportCheckpoint,
} from '@cairn/shared';

/**
 * Отчёт в любой из двух выдач.
 *
 * Один компонент на внутреннюю и публичную страницу: состав отчёта у них
 * один, и второй экземпляр разметки разошёлся бы с первым. Разница ровно
 * одна — у публичной выдачи поля `url` у чекпоинтов нет вовсе, и это видно
 * в типе, а не в условии «показывать ли».
 */
export type ReportView = ReleaseReport | PublicReleaseReport;

/** Чекпоинт отчёта: со ссылкой на задачу или без неё. */
export type ReportCheckpointView = ReportCheckpoint | Omit<ReportCheckpoint, 'url'>;

/** Унесённый чекпоинт: со ссылкой на задачу или без неё. */
export type CarriedOutCheckpointView = CarriedOutCheckpoint | Omit<CarriedOutCheckpoint, 'url'>;

/** Пропсы отчёта по релизу. */
export interface IProps {
  /** Отчёт целиком, вместе с готовым текстом: он собран на сервере. */
  report: ReportView;
}

/** Пропсы панели публичной ссылки на отчёт. */
export interface ILinkProps {
  /** Действующая ссылка либо её отсутствие. */
  link: PublicLink | null;
  /** Публикация и снятие — право суперадмина. */
  isSuperadmin: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  isPending?: boolean;
  /** Отказ сервера: показывается под содержимым панели. */
  error?: string;
}
