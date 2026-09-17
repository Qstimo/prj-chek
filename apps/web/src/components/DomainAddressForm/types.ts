import type { DomainCreate } from '@cairn/shared';

/** Проект или окружение в выпадающем списке. */
export interface IAddressOption {
  id: string;
  name: string;
}

/** Поддомен, который просят завести. */
export interface ISubdomainInput {
  name: string;
  projectId: string;
  environmentId: string;
}

/** Пропсы формы адреса. */
export interface IProps {
  /** Корни, уже заведённые в реестре: по ним строится разбор. */
  knownRoots: string[];
  projects: IAddressOption[];
  /** Окружения выбранного проекта: их грузит экран, а не форма. */
  environments: IAddressOption[];
  /** Выбранный проект; пустая строка — не выбран. */
  projectId: string;
  onProjectChange: (projectId: string) => void;
  /** Заведение корня. Не задан там, где корень уже выбран карточкой. */
  onSubmitRoot?: (input: DomainCreate) => void;
  onSubmitSubdomain: (input: ISubdomainInput) => void;
  isSubmitting?: boolean;
  error?: string;
  /**
   * Корень, под которым заводится адрес.
   *
   * Задан на карточке корня: там вводится только левая часть, а сам
   * корень уже выбран тем, что человек открыл именно эту карточку.
   */
  rootSuffix?: string;
}
