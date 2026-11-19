import { DEFAULT_MAX_SEND_BYTES, RECORDING_NEEDS_FFMPEG } from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import {
  PrepareAction,
  prepareDecision,
  type PrepareDecision,
  type PrepareDecisionInput,
} from './prepare-decision';

/**
 * Решение по записи с умолчаниями установки: `ffmpeg` есть, предел —
 * заводской.
 *
 * Умолчания живут в тесте, а не в сигнатуре: решение обязано называть все
 * свои входы, иначе установка без `ffmpeg` отличалась бы от установки с ним
 * забытым параметром, а не названным полем.
 */
function prepare(input: Partial<PrepareDecisionInput> & { uploadType: string }): PrepareDecision {
  return prepareDecision({
    uploadBytes: 1_000_000,
    isOpus: false,
    maxSendBytes: DEFAULT_MAX_SEND_BYTES,
    canExtract: true,
    ...input,
  });
}

describe('приведение записи к пригодному виду', () => {
  it('пригодное службе не трогает', () => {
    // Прогонять готовый mp3 через перекодирование — и минуты впустую, и
    // потеря качества на ровном месте: сжатое в сжатое всегда хуже.
    expect(prepare({ uploadType: 'audio/mpeg', uploadBytes: 10_000_000 })).toEqual({
      action: PrepareAction.Pass,
    });
  });

  it('видео извлекает', () => {
    expect(prepare({ uploadType: 'video/mp4', uploadBytes: 566_231_040 })).toEqual({
      action: PrepareAction.Convert,
    });
  });

  it('крупный аудиофайл тоже перекодирует', () => {
    // Часовой mp3 в 320 кбит/с стерео — 144 МБ, мимо и нашего предела
    // отправки, и провайдерского предела тела. Отказать ему, принимая
    // при этом mp4 на полгигабайта, было бы абсурдом.
    expect(prepare({ uploadType: 'audio/mpeg', uploadBytes: 144_000_000 })).toEqual({
      action: PrepareAction.Convert,
    });
  });

  it('OGG без Opus перекодирует, а не отвергает', () => {
    // Службе его отдать нельзя, а перекодировать — можно. Это и есть
    // то, что извлечение закрывает: формат перестал быть поводом для
    // отказа и стал поводом для работы.
    expect(prepare({ uploadType: 'audio/ogg', uploadBytes: 5_000_000, isOpus: false })).toEqual({
      action: PrepareAction.Convert,
    });
  });

  it('OGG с Opus отдаёт как есть', () => {
    expect(prepare({ uploadType: 'audio/ogg', uploadBytes: 5_000_000, isOpus: true })).toEqual({
      action: PrepareAction.Pass,
    });
  });

  it('m4a перекодируется, хотя это аудио', () => {
    // Служба его не берёт, и это ровно тот случай, из-за которого снято
    // решение «только аудио»: диктофон телефона отдаёт m4a.
    expect(prepare({ uploadType: 'audio/mp4', uploadBytes: 5_000_000 })).toEqual({
      action: PrepareAction.Convert,
    });
  });

  it('без ffmpeg видео получает названный отказ, а не общий', () => {
    // Формат сам по себе законен; негодна установка. Поэтому код
    // отдельный, и 409, а не 415 (дизайн, 5.3).
    expect(
      prepare({ uploadType: 'video/mp4', uploadBytes: 566_231_040, canExtract: false }),
    ).toEqual({ action: PrepareAction.Reject, code: RECORDING_NEEDS_FFMPEG });
  });

  it('без ffmpeg уже-пригодное аудио проходит', () => {
    // Установка без ffmpeg остаётся рабочей, только уже: это то же
    // правило, что «без ключа порт выключен».
    expect(prepare({ uploadType: 'audio/wav', uploadBytes: 10_000_000, canExtract: false })).toEqual(
      { action: PrepareAction.Pass },
    );
  });

  it('без ffmpeg крупное аудио тоже отвергается названным кодом', () => {
    // Урезать его нечем, и отправить нельзя.
    expect(
      prepare({ uploadType: 'audio/mpeg', uploadBytes: 144_000_000, canExtract: false }),
    ).toEqual({ action: PrepareAction.Reject, code: RECORDING_NEEDS_FFMPEG });
  });

  it('без ffmpeg OGG без Opus отвергается, хотя контейнер службе знаком', () => {
    // Знакомый контейнер и пригодное содержимое — разные вещи, и
    // проверка `OpusHead` живёт здесь именно поэтому.
    expect(
      prepare({ uploadType: 'audio/ogg', uploadBytes: 5_000_000, isOpus: false, canExtract: false }),
    ).toEqual({ action: PrepareAction.Reject, code: RECORDING_NEEDS_FFMPEG });
  });

  it('ровно на пределе отправки — ещё Pass', () => {
    // Граница включительная: предел — это «не больше», а не «меньше».
    expect(
      prepare({ uploadType: 'audio/mpeg', uploadBytes: 41_943_040, maxSendBytes: 41_943_040 }),
    ).toEqual({ action: PrepareAction.Pass });
  });

  it('на байт больше предела — уже Convert', () => {
    expect(
      prepare({ uploadType: 'audio/mpeg', uploadBytes: 41_943_041, maxSendBytes: 41_943_040 }),
    ).toEqual({ action: PrepareAction.Convert });
  });
});
