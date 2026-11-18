import {
  RECORDING_MISSING,
  TRANSCRIBER_DISABLED,
  TRANSCRIPTION_INTERRUPTED,
  TRANSCRIPTION_TIMED_OUT,
  TranscriberKind,
  TranscriptionState,
} from '@cairn/shared';

/** Что прогон делает с задачей в этом тике. */
export enum JobAction {
  /** Извлечь дорожку из загруженного файла: тяжёлый шаг. */
  Extract = 'extract',
  /** Отдать дорожку службе: тяжёлый шаг. */
  Send = 'send',
  /** Спросить службу о судьбе работы: бесплатно и ничего не раскрывает. */
  Poll = 'poll',
  /** Закрыть неудачей с названным кодом. */
  Fail = 'fail',
  /** Не трогать: либо места в тике нет, либо задача уже закрыта. */
  Leave = 'leave',
}

/** Что прогон знает о задаче, принимая решение. */
export interface JobDecisionInput {
  state: TranscriptionState;
  /** Вид службы: от него зависит, повторять ли прерванную отправку. */
  transcriber: TranscriberKind;
  /** Загруженный файл; `null` — убран при укладке текста либо потерян. */
  uploadPath: string | null;
  /** Извлечённая дорожка; `null` — отдавать службе ещё нечего. */
  audioPath: string | null;
  /** Когда задача принята. От него считается предел ожидания. */
  startedAt: Date;
  /** Когда запись покинула машину; `null` — не покидала. */
  sentAt: Date | null;
  now: Date;
  /** Сколько тяжёлых шагов осталось в этом тике. */
  heavyLeft: number;
  /** Сколько минут ждём одну расшифровку. */
  maxMinutes: number;
  /** Настроен ли порт расшифровки сейчас. */
  isEnabled: boolean;
}

/** Решение: действие и, у неудачи, её код. */
export interface JobDecision {
  action: JobAction;
  code?: string;
}

/**
 * Что делать с незакрытой задачей расшифровки.
 *
 * Чистая функция по идиоме проекта (`incidents/incident-decision.ts`,
 * `status/recheck-delay.ts`): ни обращений к базе, ни `Date.now()` внутри —
 * время приходит параметром, иначе тест на предел ожидания пришлось бы
 * писать подменой часов.
 *
 * Отвечает на главный вопрос фоновой задачи: что делать с тем, что прогон
 * увидел после перезапуска API. Различия состояний здесь **границы**, а не
 * оттенки прогресса, и решения из них растут прямые: прерванное извлечение
 * идёт на нашей машине, ничего не раскрывает и ничего не стоит — значит
 * повторяется молча; прерванная отправка **наружу** могла дойти, и повтор
 * был бы второй передачей созвона и второй оплатой, то есть выбором,
 * который дизайн не вправе сделать за человека (дизайн, 2.4).
 */
export function decide(input: JobDecisionInput): JobDecision {
  if (isClosed(input.state)) {
    // Закрытую задачу не трогает ничто, включая выключенный порт: иначе
    // выключение переписывало бы историю — `done` стал бы неудачей у
    // саммари, текст которого давно лежит в хронике.
    return { action: JobAction.Leave };
  }

  if (!input.isEnabled) {
    // Выключенный порт закрывает очередь, а не держит её: иначе задачи,
    // загруженные до того, как администратор выключил порт, висели бы «в
    // очереди» вечно. Касается и `extracting`: дорожка, которую некуда
    // отправить, минут процессора не стоит.
    return { action: JobAction.Fail, code: TRANSCRIBER_DISABLED };
  }

  if (input.state === TranscriptionState.Running) {
    // Предел ожидания — про **нашу** меру терпения, не про провайдера, и
    // считается от приёма, а не от отправки: иначе задача, простоявшая
    // час в очереди, получала бы на расшифровку лишний час, то есть
    // предел зависел бы от длины очереди.
    //
    // И только для `running`: в остальных незакрытых состояниях никто
    // ничего не ждёт — задача либо не дошла до своего тика, либо работа
    // идёт у нас под своим пределом.
    if (minutesSince(input.startedAt, input.now) > input.maxMinutes) {
      return { action: JobAction.Fail, code: TRANSCRIPTION_TIMED_OUT };
    }

    // Опрос бесплатен и места в тике не занимает: занять им место значило
    // бы задержать расшифровку, которая у провайдера уже готова.
    return { action: JobAction.Poll };
  }

  if (input.state === TranscriptionState.Sending) {
    // Единственное место, где вид службы меняет решение, и причина ровно
    // в границе передачи данных, а не в надёжности адаптеров.
    if (input.transcriber === TranscriberKind.External) {
      return { action: JobAction.Fail, code: TRANSCRIPTION_INTERRUPTED };
    }

    return heavyOr({ action: JobAction.Send }, input.heavyLeft);
  }

  // Остались `queued` и `extracting`: работа идёт либо ещё не начата, и
  // оба требуют файла. «Исходника нет, а дорожка есть» — не отказ, а
  // обычный повтор: после укладки текста исходника нет у **каждого**
  // саммари (решение владельца 2), и спутать эти два случая значит
  // сломать «Расшифровать снова» навсегда.
  if (input.audioPath === null && input.uploadPath === null) {
    // Отказ проверяется до места в тике: он не занимает ни ядра, ни
    // памяти, и держать его до следующего тика незачем.
    return { action: JobAction.Fail, code: RECORDING_MISSING };
  }

  const action = input.audioPath === null ? JobAction.Extract : JobAction.Send;

  return heavyOr({ action }, input.heavyLeft);
}

/** Закрытые состояния: их решение не касается. */
function isClosed(state: TranscriptionState): boolean {
  return state === TranscriptionState.Done || state === TranscriptionState.Failed;
}

/**
 * Тяжёлое действие либо «оставить до следующего тика».
 *
 * Извлечение и отправка делят один бюджет, потому что это один и тот же
 * ресурс — ядро и память машины: `ffmpeg` занимает ядро на минуты, а
 * отправка кодирует 40 МиБ в ≈56 МБ в куче. Бюджет, считающий их по
 * отдельности, не бюджет.
 */
function heavyOr(decision: JobDecision, heavyLeft: number): JobDecision {
  return heavyLeft > 0 ? decision : { action: JobAction.Leave };
}

/** Сколько минут прошло между двумя отметками. */
function minutesSince(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / 60_000;
}
