import {
  RECORDING_MISSING,
  TRANSCRIBER_DISABLED,
  TRANSCRIPTION_INTERRUPTED,
  TRANSCRIPTION_TIMED_OUT,
  TranscriberKind,
  TranscriptionState,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { JobAction, decide, type JobDecisionInput } from './job-decision';

/** Задача в работе: оба файла на месте, место в тике есть, порт включён. */
const JOB: JobDecisionInput = {
  state: TranscriptionState.Running,
  transcriber: TranscriberKind.External,
  uploadPath: 'j.mp4',
  audioPath: 'j.opus',
  startedAt: new Date('2026-11-17T10:00:00Z'),
  sentAt: new Date('2026-11-17T10:04:00Z'),
  now: new Date('2026-11-17T10:10:00Z'),
  heavyLeft: 1,
  maxMinutes: 120,
  isEnabled: true,
};

describe('решение о незакрытой задаче', () => {
  it('queued без дорожки идёт на извлечение', () => {
    expect(decide({ ...JOB, state: TranscriptionState.Queued, audioPath: null })).toEqual({
      action: JobAction.Extract,
    });
  });

  it('queued с готовой дорожкой отправляется: наружу не ушло ничего', () => {
    expect(decide({ ...JOB, state: TranscriptionState.Queued })).toEqual({
      action: JobAction.Send,
    });
  });

  it('прерванное извлечение повторяется молча', () => {
    // Извлечение идёт на нашей машине: ничего не раскрывает и ничего не
    // стоит, кроме минут своего же процессора. То же рассуждение, по
    // которому повторяется прерванная отправка в свой контур.
    expect(decide({ ...JOB, state: TranscriptionState.Extracting, audioPath: null })).toEqual({
      action: JobAction.Extract,
    });
  });

  it('извлечение и отправка делят один тяжёлый шаг', () => {
    // Это один и тот же ресурс — ядро и память машины, — и бюджет,
    // считающий их по отдельности, не бюджет.
    expect(
      decide({ ...JOB, state: TranscriptionState.Extracting, audioPath: null, heavyLeft: 0 }),
    ).toEqual({ action: JobAction.Leave });
  });

  it('прерванная отправка у внешней службы — неудача, не повтор', () => {
    // Мы не знаем, получил ли провайдер запись. Отправить ещё раз — это
    // вторая передача созвона наружу и вторая оплата, то есть молча
    // сделанный выбор, которого дизайн делать не вправе.
    expect(
      decide({ ...JOB, state: TranscriptionState.Sending, transcriber: TranscriberKind.External }),
    ).toEqual({ action: JobAction.Fail, code: TRANSCRIPTION_INTERRUPTED });
  });

  it('прерванная отправка в свой контур повторяется', () => {
    // Передача в контур ничего не раскрывает и ничего не стоит:
    // единственная цена повтора — минуты своего же процессора.
    expect(
      decide({ ...JOB, state: TranscriptionState.Sending, transcriber: TranscriberKind.Local }),
    ).toEqual({ action: JobAction.Send });
  });

  it('running опрашивается: провайдер работает без нашего процесса', () => {
    // Перезапуск API расшифровку не теряет — это и есть причина
    // держать состояние в базе, а не в памяти.
    expect(decide({ ...JOB, state: TranscriptionState.Running })).toEqual({
      action: JobAction.Poll,
    });
  });

  it('опрос тяжёлым шагом не считается', () => {
    // Он бесплатен и ничего не раскрывает: занять им место в тике значило
    // бы задержать расшифровку, которая уже готова.
    expect(decide({ ...JOB, state: TranscriptionState.Running, heavyLeft: 0 })).toEqual({
      action: JobAction.Poll,
    });
  });

  it('running дольше предела закрывается неудачей', () => {
    // Предел — про нашу меру ожидания, не про провайдера. Иначе строка
    // висела бы вечно на операции, которой у провайдера уже нет.
    expect(
      decide({
        ...JOB,
        state: TranscriptionState.Running,
        startedAt: new Date('2026-11-17T08:00:00Z'),
        now: new Date('2026-11-17T11:00:00Z'),
      }),
    ).toEqual({ action: JobAction.Fail, code: TRANSCRIPTION_TIMED_OUT });
  });

  it('предел считается от приёма, а не от отправки', () => {
    // Иначе задача, простоявшая час в очереди, получала бы на расшифровку
    // лишний час — то есть предел зависел бы от длины очереди.
    expect(
      decide({
        ...JOB,
        state: TranscriptionState.Running,
        startedAt: new Date('2026-11-17T08:00:00Z'),
        sentAt: new Date('2026-11-17T10:30:00Z'),
        now: new Date('2026-11-17T10:40:00Z'),
      }).action,
    ).toBe(JobAction.Fail);
  });

  it('очередь предела ожидания не расходует', () => {
    // В `queued` ни мы, ни провайдер ничего не ждём: задача просто не
    // дошла до своего тика, и закрыть её за стояние в очереди значило бы
    // сделать предел зависящим от длины очереди с другой стороны.
    expect(
      decide({
        ...JOB,
        state: TranscriptionState.Queued,
        startedAt: new Date('2026-11-17T08:00:00Z'),
        now: new Date('2026-11-17T11:00:00Z'),
      }).action,
    ).toBe(JobAction.Send);
  });

  it('queued сверх места в тике остаётся на следующий', () => {
    // Тяжёлый шаг за тик один: ffmpeg занимает ядро на минуты, а
    // отправка кодирует 40 МиБ в ≈56 МБ в куче.
    expect(decide({ ...JOB, state: TranscriptionState.Queued, heavyLeft: 0 })).toEqual({
      action: JobAction.Leave,
    });
  });

  it('у задачи без файлов вовсе работать нечем', () => {
    // Файлы убрали руками или потеряли вместе с томом.
    expect(
      decide({ ...JOB, state: TranscriptionState.Queued, uploadPath: null, audioPath: null }),
    ).toEqual({ action: JobAction.Fail, code: RECORDING_MISSING });
  });

  it('отсутствие файлов закрывает задачу и без места в тике', () => {
    // Отказ не занимает ни ядра, ни памяти: держать его до следующего
    // тика незачем.
    expect(
      decide({
        ...JOB,
        state: TranscriptionState.Queued,
        uploadPath: null,
        audioPath: null,
        heavyLeft: 0,
      }),
    ).toEqual({ action: JobAction.Fail, code: RECORDING_MISSING });
  });

  it('пустой исходник при живой дорожке — не отказ, а обычный повтор', () => {
    // После укладки текста исходника нет у КАЖДОГО саммари (решение
    // владельца 2), и «Расшифровать снова» обязано работать. Спутать
    // эти два случая значит сломать повтор навсегда.
    expect(
      decide({ ...JOB, state: TranscriptionState.Queued, uploadPath: null, audioPath: 'j.opus' }),
    ).toEqual({ action: JobAction.Send });
  });

  it('выключенный порт закрывает очередь, а не держит её', () => {
    // Иначе задачи, загруженные до того, как администратор выключил
    // порт, висели бы «в очереди» вечно.
    expect(decide({ ...JOB, state: TranscriptionState.Queued, isEnabled: false })).toEqual({
      action: JobAction.Fail,
      code: TRANSCRIBER_DISABLED,
    });
  });

  it('выключенный порт закрывает и то, что уже извлекается', () => {
    // Дорожка, которую некуда отправить, не стоит минут процессора, а
    // главное — ждать её конца не для чего.
    expect(
      decide({ ...JOB, state: TranscriptionState.Extracting, audioPath: null, isEnabled: false }),
    ).toEqual({ action: JobAction.Fail, code: TRANSCRIBER_DISABLED });
  });

  it.each([TranscriptionState.Done, TranscriptionState.Failed])('%s не трогается', (state) => {
    expect(decide({ ...JOB, state }).action).toBe(JobAction.Leave);
  });

  it('закрытая задача не трогается и при выключенном порте', () => {
    // Иначе выключение порта переписывало бы историю: `done` стал бы
    // неудачей у саммари, текст которого давно лежит в хронике.
    expect(decide({ ...JOB, state: TranscriptionState.Done, isEnabled: false })).toEqual({
      action: JobAction.Leave,
    });
  });
});
