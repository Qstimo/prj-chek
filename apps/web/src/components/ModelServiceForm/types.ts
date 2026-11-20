import type {
  ModelAuthScheme,
  ModelServiceKind,
  ModelServicePlacement,
  ModelServiceSettings,
  ModelServiceUpdate,
} from '@cairn/shared';

/**
 * Заготовка провайдера: подсказка формы, а не запись в базе.
 *
 * `isUnverified` — не украшение: один адрес из четырёх подтверждён только
 * третьими источниками, и форма обязана это сказать, а не выдать его за
 * факт (дизайн, таблица проверок, пункт 1).
 */
export interface Preset {
  value: string;
  label: string;
  /** Пусто означает «подставлять нечего»: у своего узла адрес свой. */
  baseUrl: string;
  authScheme: ModelAuthScheme;
  /** Подсказка у поля модели: форма имени, а не само имя. */
  modelHint: string;
  isUnverified?: boolean;
}

/** Черновик формы: правки накапливаются в памяти до «Сохранить». */
export interface ModelServiceFormValues {
  baseUrl: string;
  authScheme: ModelAuthScheme;
  model: string;
  folder: string;
  placement: ModelServicePlacement;
  timeoutSeconds: string;
  isEnabled: boolean;
  /** Вписанный ключ. Пусто означает «не менять»: сервер его не отдаёт. */
  secret: string;
  /** Нажато «Убрать ключ»: уедет `null`, а не отсутствие поля. */
  isSecretCleared: boolean;
}

/** Пропсы формы настройки узла службы модели. */
export interface IProps {
  settings: ModelServiceSettings;
  /** Сохранить настройку целиком. */
  onSave: (input: ModelServiceUpdate) => void;
  /** Закрыть форму без сохранения. */
  onClose: () => void;
  /** Отказ сервера: показывается рядом с кнопкой. */
  error?: string;
  isSubmitting?: boolean;
}

/** Пропсы поля ключа. */
export interface ISecretFieldProps {
  /** Задан ли ключ сейчас: на экране об этом сказано словами. */
  hasSecret: boolean;
  value: string;
  isCleared: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
}

/** Пропсы поля выбора с подписью. */
export interface ISelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Подсказка под полем: честная подпись у каталога, форма имени модели. */
  hint?: string;
}

/** Пропсы полей «как мы с этим узлом обходимся». */
export interface ILimitFieldsProps {
  values: ModelServiceFormValues;
  onChange: <K extends keyof ModelServiceFormValues>(
    key: K,
    value: ModelServiceFormValues[K],
  ) => void;
  /**
   * Узел, который правят.
   *
   * Нужен полям, а не только форме: выбор вида и подпись у каталога
   * зависят от узла, и собрать их в форме значило бы протащить два
   * пропса там, где довольно одного — того, что уже есть в настройке.
   */
  kind: ModelServiceKind;
}

/** Пропсы полей самого узла. */
export interface INodeFieldsProps extends ILimitFieldsProps {
  /** Подсказка формы имени модели от выбранного пресета. */
  modelHint?: string;
}
