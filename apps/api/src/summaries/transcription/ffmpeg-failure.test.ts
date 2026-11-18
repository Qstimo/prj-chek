import {
  EXTRACTION_FAILED,
  EXTRACTION_TIMED_OUT,
  RECORDING_BROKEN,
  RECORDING_CODEC_UNSUPPORTED,
  RECORDING_NO_AUDIO_TRACK,
  TRANSCRIPTION_TOO_LARGE,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { ExtractStage, ffmpegFailureOf } from './ffmpeg-failure';

describe('классификация отказа извлечения', () => {
  it('ffprobe упал — контейнер битый', () => {
    expect(ffmpegFailureOf({ stage: ExtractStage.Probe, exitCode: 1 })).toBe(RECORDING_BROKEN);
  });

  it('ffprobe отработал, аудиопотока нет', () => {
    // Выгрузили только видео — и человеку надо выгрузить заново со
    // звуком, а не нажимать «снова».
    expect(
      ffmpegFailureOf({ stage: ExtractStage.Probe, exitCode: 0, probe: { hasAudio: false } }),
    ).toBe(RECORDING_NO_AUDIO_TRACK);
  });

  it('ffprobe отработал, дорожка есть — отказа нет', () => {
    expect(
      ffmpegFailureOf({ stage: ExtractStage.Probe, exitCode: 0, probe: { hasAudio: true } }),
    ).toBeNull();
  });

  it('ffmpeg убит по пределу времени', () => {
    expect(ffmpegFailureOf({ stage: ExtractStage.Convert, killed: true })).toBe(
      EXTRACTION_TIMED_OUT,
    );
  });

  it('убитый процесс не выдаёт себя за отказ декодера', () => {
    // Убийство по пределу обрывает ffmpeg где угодно, в том числе на
    // строке про кодек: порядок проверок здесь и есть решение.
    expect(
      ffmpegFailureOf({
        stage: ExtractStage.Convert,
        killed: true,
        exitCode: 1,
        stderrTail: 'Decoder (codec ac3) not found for codec id 86019',
      }),
    ).toBe(EXTRACTION_TIMED_OUT);
  });

  it.each([
    'Decoder (codec ac3) not found for codec id 86019',
    'Unsupported codec with id 86076 for input stream 1',
  ])('отказ декодера узнаётся по stderr: %s', (stderrTail) => {
    // Единственное место в дизайне, которое читает чужой текст.
    // Названная причина стоит одного хрупкого сравнения.
    expect(
      ffmpegFailureOf({ stage: ExtractStage.Convert, exitCode: 1, stderrTail }),
    ).toBe(RECORDING_CODEC_UNSUPPORTED);
  });

  it('незнакомый отказ ffmpeg деградирует в честное «не вышло»', () => {
    // Деградация тихая и в нужную сторону: человек получит правду,
    // только менее полезную. Обратная конструкция — угадывать «кодек»
    // по любому отказу — врала бы.
    expect(
      ffmpegFailureOf({ stage: ExtractStage.Convert, exitCode: 1, stderrTail: 'что-то новое' }),
    ).toBe(EXTRACTION_FAILED);
  });

  it('отказ без stderr вовсе — тоже честное «не вышло»', () => {
    expect(ffmpegFailureOf({ stage: ExtractStage.Convert, exitCode: 1 })).toBe(EXTRACTION_FAILED);
  });

  it('дорожка вышла, но больше предела отправки', () => {
    expect(
      ffmpegFailureOf({
        stage: ExtractStage.Convert,
        exitCode: 0,
        audioBytes: 44_000_000,
        maxSendBytes: 41_943_040,
      }),
    ).toBe(TRANSCRIPTION_TOO_LARGE);
  });

  it('ровно на пределе отправки отказа нет', () => {
    // Та же включительная граница, что у решения о приведении: предел —
    // это «не больше».
    expect(
      ffmpegFailureOf({
        stage: ExtractStage.Convert,
        exitCode: 0,
        audioBytes: 41_943_040,
        maxSendBytes: 41_943_040,
      }),
    ).toBeNull();
  });

  it('успех кодом отказа не называется', () => {
    expect(
      ffmpegFailureOf({
        stage: ExtractStage.Convert,
        exitCode: 0,
        audioBytes: 11_000_000,
        maxSendBytes: 41_943_040,
      }),
    ).toBeNull();
  });

  it('три отказа извлечения не сводятся в один', () => {
    // Человек по ним делает разное: нет дорожки — выгрузить созвон со
    // звуком, битый контейнер — выгрузить заново целиком, «не вышло» —
    // нажать «снова», потому что причина у нас (дизайн, 7.5).
    const codes = new Set([
      ffmpegFailureOf({ stage: ExtractStage.Probe, exitCode: 1 }),
      ffmpegFailureOf({ stage: ExtractStage.Probe, exitCode: 0, probe: { hasAudio: false } }),
      ffmpegFailureOf({ stage: ExtractStage.Convert, exitCode: 1 }),
    ]);

    expect(codes.size).toBe(3);
  });
});
