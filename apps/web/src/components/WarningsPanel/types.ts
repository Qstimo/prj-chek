import type { StatusWarning } from '@cairn/shared';

/** Срочность блока предупреждений: определяет цвет и порядок на экране. */
export enum WarningTone {
  /** Не отвечает — действовать сейчас. */
  Critical = 'critical',
  /** Сроки и ошибки проверок — действовать на неделе. */
  Attention = 'attention',
}

/** Расшифровка вида предупреждения на языке интерфейса. */
export interface WarningGuide {
  /** Что произошло — заголовком, вместо сырого вида. */
  title: string;
  /** Чем это грозит. */
  meaning: string;
  /** Чьё это действие и какое. */
  action: string;
}

/** Предупреждение, возможно ведущее на свой проект. */
export type PanelWarning = StatusWarning & { href?: string };

/** Пропсы панели предупреждений. */
export interface IProps {
  warnings: PanelWarning[];
  /** Заголовок блока; по умолчанию — «Предупреждения». */
  title?: string;
  /** Срочность; по умолчанию — «требует внимания». */
  tone?: WarningTone;
}
