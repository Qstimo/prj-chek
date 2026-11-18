import {
  DEFAULT_MAX_SEND_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES,
  RECORDING_HEAD_BYTES,
  RECORDING_NOT_AUDIO,
  RECORDING_TOO_LARGE,
  RECORDING_TYPE_NOT_ACCEPTED,
  TranscriberKind,
  UPLOAD_TYPES,
  type TranscriberInfo,
} from '@cairn/shared';
import { describe, expect, it } from 'vitest';

import { readRecording } from './readRecording';

/** ISO-BMFF: `ftyp` на смещении 4. Так начинаются mp4, m4a и mov. */
const ISO_BMFF = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32];
/** EBML: так начинаются mkv и webm. */
const EBML = [0x1a, 0x45, 0xdf, 0xa3];
/** Документ, переименованный в запись созвона. */
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];

/** Настройки службы, какими их отдаёт `GET /summaries/transcriber`. */
const SETTINGS: TranscriberInfo = {
  isEnabled: true,
  kind: TranscriberKind.External,
  host: 'stt.api.cloud.yandex.net',
  model: 'general',
  maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
  maxSendBytes: DEFAULT_MAX_SEND_BYTES,
  canExtract: true,
  acceptedTypes: [...UPLOAD_TYPES],
  audioBitrate: '24k',
};

/** Файл, который помнит, сколько и чего у него прочитали. */
interface IFakeFile extends File {
  sliceCalls: number;
  sliceArgs: number[];
}

/**
 * Файл заявленного размера с настоящей головой.
 *
 * Настоящего медиафайла здесь нет и быть не может: подпись собирается из
 * байтов, а размер объявляется — читать полгигабайта в тесте незачем ровно
 * по той причине, по которой этого не делает и сама функция.
 */
function fakeFile({
  name,
  head = [],
  size,
  type = '',
}: {
  name: string;
  head?: number[];
  size?: number;
  type?: string;
}): IFakeFile {
  const bytes = new Uint8Array(RECORDING_HEAD_BYTES);

  bytes.set(head);

  const file = new File([bytes], name, { type }) as IFakeFile;
  const slice = file.slice.bind(file);

  file.sliceCalls = 0;
  file.sliceArgs = [];
  file.slice = (start?: number, end?: number) => {
    file.sliceCalls += 1;
    file.sliceArgs = [start ?? 0, end ?? bytes.length];

    return slice(start, end);
  };

  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size });
  }

  return file;
}

describe('чтение записи в браузере', () => {
  it('сначала размер: файл больше предела не читается вовсе', async () => {
    // Читать два гигабайта, чтобы потом отказать, незачем — и теперь
    // это не риторика, а настоящие два гигабайта.
    const file = fakeFile({ size: 3_000_000_000, name: 'созвон.mp4' });

    await expect(readRecording(file, SETTINGS)).rejects.toMatchObject({
      code: RECORDING_TOO_LARGE,
    });
    expect(file.sliceCalls).toBe(0);
  });

  it('читает только голову, а не файл целиком', async () => {
    // Полгигабайта в памяти браузера ради подписи незачем: читается
    // RECORDING_HEAD_BYTES, и это то же число, что на сервере.
    const file = fakeFile({ size: 566_231_040, head: ISO_BMFF, name: 'созвон.mp4' });

    await readRecording(file, SETTINGS);

    expect(file.sliceArgs).toEqual([0, 64]);
  });

  it('тип берётся из расширения, а не из File.type', async () => {
    // File.type ставит операционная система по тому же расширению, и
    // подделать его ничего не стоит.
    const file = fakeFile({ name: 'созвон.mp4', type: 'application/octet-stream', head: ISO_BMFF });

    expect((await readRecording(file, SETTINGS)).uploadType).toBe('video/mp4');
  });

  it('подпись сверяется с семейством расширения', async () => {
    const file = fakeFile({ name: 'созвон.mp4', head: PDF });

    await expect(readRecording(file, SETTINGS)).rejects.toMatchObject({
      code: RECORDING_NOT_AUDIO,
    });
  });

  it('mp4 и m4a проходят: теперь это обычные форматы', async () => {
    // Решение «только аудио» снято: записи владельца приходят mp4.
    for (const name of ['созвон.mp4', 'диктофон.m4a', 'запись.mov', 'obs.mkv']) {
      await expect(
        readRecording(fakeFile({ name, head: name.endsWith('.mkv') ? EBML : ISO_BMFF }), SETTINGS),
      ).resolves.toBeDefined();
    }
  });

  it('отвергает формат, которого нет в списке установки', async () => {
    // Список приходит с сервера: на установке без ffmpeg он сужен до
    // трёх, и браузер не предлагает того, что сервер отвергнет.
    const file = fakeFile({ name: 'созвон.mp4', head: ISO_BMFF });

    await expect(
      readRecording(file, { ...SETTINGS, acceptedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'] }),
    ).rejects.toMatchObject({ code: RECORDING_TYPE_NOT_ACCEPTED });
  });

  it('чужое расширение не принимается вовсе', async () => {
    // Расширения нет в карте — значит и типа запроса не из чего взять:
    // `Content-Type` ставит веб по расширению, а не по File.type.
    await expect(
      readRecording(fakeFile({ name: 'созвон.avi', head: ISO_BMFF }), SETTINGS),
    ).rejects.toMatchObject({ code: RECORDING_TYPE_NOT_ACCEPTED });
  });

  it('имя файла в результат не попадает', async () => {
    // Имена файлов на машинах людей нередко говорят больше, чем
    // содержимое.
    const read = await readRecording(
      fakeFile({ name: 'Клиент Б, разбор инцидента.mp4', head: ISO_BMFF }),
      SETTINGS,
    );

    expect(JSON.stringify({ uploadType: read.uploadType, bytes: read.bytes })).not.toContain(
      'Клиент',
    );
  });
});
