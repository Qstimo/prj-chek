import {
  TRACKER_NOT_CONFIGURED,
  TrackerKind,
  type TrackerProbeResult,
  type TrackerTargets,
} from '@cairn/shared';

import {
  TrackerFailure,
  type Tracker,
  type TrackerTarget,
  type TrackerTaskInput,
  type TrackerTaskState,
} from './tracker';

/**
 * Порт выключен: подключение трекера не настроено (дизайн, 6).
 *
 * Нужен, потому что система self-hosted и обязана работать без внешних
 * зависимостей: установка без трекера остаётся полностью рабочей — задачи
 * заводятся, кладутся в версии, вынимаются, прогресс считается. Кнопки
 * «Выгрузить выбранные» при выключенном порте нет вовсе, а на её месте
 * одна строка с причиной: предложить выгрузку, которая никуда не поедет,
 * значит предложить впустую.
 *
 * В сеть не ходит ни при каких условиях: это и проверяется тестом.
 */
export class DisabledTracker implements Tracker {
  readonly kind = TrackerKind.Weeek;
  /** Называть узел, куда ничего не уходит, значило бы врать подписью. */
  readonly host = null;
  readonly isEnabled = false;

  /** Аргументы объявлены, но не читаются: наружу не уходит ни байта. */
  async createTask(
    _input: TrackerTaskInput,
    _target: TrackerTarget,
    _signal: AbortSignal,
  ): Promise<TrackerTaskState> {
    throw this.disabled();
  }

  async updateTask(
    _externalId: string,
    _input: TrackerTaskInput,
    _signal: AbortSignal,
  ): Promise<TrackerTaskState> {
    throw this.disabled();
  }

  async readTasks(_target: TrackerTarget, _signal: AbortSignal): Promise<TrackerTaskState[]> {
    throw this.disabled();
  }

  async readTaskLink(_url: string, _target: TrackerTarget, _signal: AbortSignal): Promise<TrackerTaskState> {
    throw this.disabled();
  }

  /**
   * Списков нет, и пустые отдавать нельзя.
   *
   * Отказ, а не три пустых списка: пустой список читается как «у вас нет
   * досок», то есть посылает человека заводить доску вместо того, чтобы
   * идти к администратору за токеном.
   */
  async targets(_signal: AbortSignal): Promise<TrackerTargets> {
    throw this.disabled();
  }

  /**
   * Проверять связь нечем: подключения нет.
   *
   * Отказ, а не исход «не ответил»: исход означал бы, что мы спросили, — а
   * выключенный порт в сеть не ходит ни при каких условиях. Ручка
   * администрирования до него и не доходит: она сама отвечает `409` на
   * ненастроенное подключение, и этот отказ — вторая стена, не первая.
   */
  async probe(_signal: AbortSignal): Promise<TrackerProbeResult> {
    throw this.disabled();
  }

  /** Один и тот же отказ на все операции: причина у них одна. */
  private disabled(): TrackerFailure {
    return new TrackerFailure(
      TRACKER_NOT_CONFIGURED,
      'Трекер задач не настроен: обратитесь к администратору.',
    );
  }
}
