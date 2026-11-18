import { describe, expect, it } from 'vitest';

import {
  RECORDING_HEAD_BYTES,
  UploadFamily,
  familyAcceptsType,
  uploadFamilyOf,
} from './recording-type';

/** Собирает голову файла из подписи и добивки нулями. */
function head(signature: number[], size = 64): Uint8Array {
  const bytes = new Uint8Array(size);

  bytes.set(signature);

  return bytes;
}

/** `RIFF….WAVE`: четыре байта размера между подписями не значат ничего. */
const WAV = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
const ID3 = [0x49, 0x44, 0x33, 0x03];
/** Синхронизация кадра MPEG без тега ID3: так пишут многие конвертеры. */
const MPEG_SYNC = [0xff, 0xfb, 0x90, 0x00];
const OGG = [0x4f, 0x67, 0x67, 0x53];
const FLAC = [0x66, 0x4c, 0x61, 0x43];
/** ISO-BMFF: `ftyp` на смещении 4. Так начинаются mp4, m4a и mov. */
const ISO_BMFF = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32];
/** EBML: так начинаются mkv и webm. */
const EBML = [0x1a, 0x45, 0xdf, 0xa3];

describe('семейство контейнера по подписи', () => {
  it.each([
    [ID3, UploadFamily.MpegAudio],
    [MPEG_SYNC, UploadFamily.MpegAudio],
    [WAV, UploadFamily.RiffWave],
    [OGG, UploadFamily.Ogg],
    [FLAC, UploadFamily.Flac],
    [ISO_BMFF, UploadFamily.IsoBmff],
    [EBML, UploadFamily.Matroska],
  ])('узнаёт %#', (signature, family) => {
    expect(uploadFamilyOf(head(signature))).toBe(family);
  });

  it('RIFF без WAVE семейством не считается', () => {
    // RIFF — контейнер общего вида: так начинается и AVI.
    const avi = [...WAV.slice(0, 8), 0x41, 0x56, 0x49, 0x20];

    expect(uploadFamilyOf(head(avi))).toBeNull();
  });

  it('OGG без Opus теперь проходит: его перекодируют', () => {
    // Правка от 2026-11-17: раньше OGG/Vorbis отвергался на загрузке,
    // потому что отдавать службе было нечего. Теперь он принимается и
    // перекодируется, а строгая проверка `OpusHead` живёт там, где
    // решается «можно отдать как есть» (prepareDecision, Task 12).
    expect(uploadFamilyOf(head(OGG))).toBe(UploadFamily.Ogg);
  });

  it('документ, переименованный в mp4, не проходит', () => {
    // Главное, что покупает эта функция: два гигабайта чужого формата
    // не доезжают до тома — приём обрывается на первом куске.
    const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];

    expect(uploadFamilyOf(head(pdf))).toBeNull();
  });

  it('пустую и короткую голову не принимает, а отвечает null', () => {
    // Не бросает: негодный файл — обычный случай, а не авария.
    expect(uploadFamilyOf(new Uint8Array(0))).toBeNull();
    expect(uploadFamilyOf(new Uint8Array([0x49]))).toBeNull();
  });

  it('не принимает ISO-BMFF по обрезанной подписи', () => {
    // Голова оборвалась внутри `ftyp`: первый кусок потока может быть и
    // короче 64 байт, и решение по нему обязано быть «нет», а не «да».
    expect(uploadFamilyOf(new Uint8Array(ISO_BMFF.slice(0, 7)))).toBeNull();
  });

  it('сколько байт нужно для решения, названо константой', () => {
    // Браузер по ней режет `file.slice`, сервер по ней берёт голову
    // первого куска потока; второе число разошлось бы с первым.
    expect(RECORDING_HEAD_BYTES).toBe(64);
  });
});

describe('объявленный тип против семейства', () => {
  it.each([
    ['video/mp4', UploadFamily.IsoBmff],
    ['audio/mp4', UploadFamily.IsoBmff],
    ['video/quicktime', UploadFamily.IsoBmff],
    ['video/x-matroska', UploadFamily.Matroska],
    ['video/webm', UploadFamily.Matroska],
    ['audio/webm', UploadFamily.Matroska],
  ])('%s принадлежит своему семейству', (type, family) => {
    // mp4, m4a и mov подписью не различаются, и притворяться, что
    // различаются, значило бы отказывать на честном файле из-за
    // неожиданного бренда внутри `ftyp`.
    expect(familyAcceptsType(family, type)).toBe(true);
  });

  it('mp3, объявленный как mp4, не проходит', () => {
    expect(familyAcceptsType(UploadFamily.MpegAudio, 'video/mp4')).toBe(false);
  });

  it('тип вне карты не принадлежит ни одному семейству', () => {
    // `video/x-msvideo` в широкий список не входит, и ответ обязан быть
    // «нет», а не «не знаю»: иначе AVI прошёл бы проверку подписи.
    for (const family of Object.values(UploadFamily)) {
      expect(familyAcceptsType(family, 'video/x-msvideo')).toBe(false);
    }
  });
});
