import {
  AccessLevel,
  RECORDING_MISSING,
  RECORDING_NEEDS_FFMPEG,
  RECORDING_NOT_AUDIO,
  RECORDING_TOO_LARGE,
  RECORDING_TYPE_NOT_ACCEPTED,
  Section,
  TRANSCRIBER_DISABLED,
  TRANSCRIPTION_ALREADY_RUNNING,
  TranscriptionState,
  transcriberInfoSchema,
} from '@cairn/shared';
import { eq } from 'drizzle-orm';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { transcriptionJobs } from '../../db/schema';
import { summariesHttpFixture, SUMMARY_BODY } from '../../../test/summaries-http-fixture';
import { RECORDING_MAX_BYTES_ENV } from './settings';

/** `ftyp` на смещении 4: так начинаются mp4, m4a и mov. */
const MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
]);

/** Тег ID3: так начинается mp3. */
const MP3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]), Buffer.alloc(58)]);

/** Документ, переименованный в mp4: до тома доезжать не должен. */
const PDF = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(56)]);

/** Байты «дорожки»: содержимое неважно, важна отдача потоком. */
const TRACK = Buffer.from('OggS-дорожка-созвона-для-проверки-перемотки');

describe('HTTP: расшифровка записи созвона', () => {
  const fixture = summariesHttpFixture();
  const base = (): string => `/projects/${fixture.state.projectId}/summaries`;

  beforeEach(() => {
    delete process.env[RECORDING_MAX_BYTES_ENV];
  });

  afterEach(() => {
    delete process.env[RECORDING_MAX_BYTES_ENV];
  });

  /** Загружает запись сырым телом с паспортом в строке запроса. */
  function upload(
    agent: ReturnType<typeof fixture.anonymous>,
    overrides: Record<string, string> = {},
    body: Buffer = MP4,
  ) {
    return agent
      .post(`${base()}/transcriptions`)
      .query({
        occurredOn: '2026-11-17',
        title: 'Созвон по релизу',
        uploadType: 'video/mp4',
        ...overrides,
      })
      .set('Content-Type', String(overrides.uploadType ?? 'video/mp4'))
      .send(body);
  }

  /**
   * Саммари с готовой дорожкой — состояние, которое оставляет прогон.
   *
   * Доводится базой: ручки, укладывающей текст, нет и быть не должно —
   * текст приносит прогон, а не человек.
   */
  async function settled(): Promise<{ summaryId: string; jobId: string; audioPath: string }> {
    const agent = await fixture.signIn();
    const accepted = await upload(agent, { uploadType: 'audio/mpeg' }, MP3).expect(202);
    const summary = await agent.post(base()).send(SUMMARY_BODY).expect(201);
    const audioPath = `${accepted.body.id}.opus`;

    await writeFile(join(fixture.recordingsDir(), audioPath), TRACK);
    await fixture
      .db()
      .db.update(transcriptionJobs)
      .set({
        summaryId: summary.body.id,
        state: TranscriptionState.Done,
        uploadPath: null,
        audioPath,
        audioBytes: TRACK.length,
        audioType: 'audio/ogg',
      })
      .where(eq(transcriptionJobs.id, accepted.body.id));

    return { summaryId: summary.body.id, jobId: accepted.body.id, audioPath };
  }

  describe('приём записи', () => {
    it('принимает запись сырым телом и паспортом в строке запроса', async () => {
      const agent = await fixture.signIn();
      const response = await upload(agent).expect(202);

      expect(response.body).toMatchObject({
        state: TranscriptionState.Queued,
        uploadType: 'video/mp4',
        uploadBytes: MP4.length,
        summaryId: null,
        title: 'Созвон по релизу',
      });
    });

    it('тело не проходит через разборщик и достаётся контроллеру потоком', async () => {
      // `express.json` и `urlencoded` стоят на своих типах содержимого и
      // `video/mp4` не касаются; поэтому `main.ts` не правится вовсе, и
      // это лучше, чем правится (дизайн, 5.2). Сторож — байты на томе:
      // разборщик, съевший тело, оставил бы файл пустым или иным.
      const agent = await fixture.signIn();
      const response = await upload(agent).expect(202);
      const saved = await readFile(join(fixture.recordingsDir(), `${response.body.id}.mp4`));

      expect(saved.equals(MP4)).toBe(true);
    });

    it('негодный паспорт отвергается схемой', async () => {
      const agent = await fixture.signIn();

      await upload(agent, { occurredOn: 'вчера' }).expect(400);
      await upload(agent, { title: '' }).expect(400);
    });

    it('лишнее поле в строке запроса отвергается схемой', async () => {
      // Строгая схема: имя присланного файла мы не хотим ни получать, ни
      // хранить, и форма, которая его приносит, — приглашение сохранить.
      const agent = await fixture.signIn();

      await upload(agent, { fileName: 'Клиент Б, разбор инцидента.mp4' }).expect(400);
    });

    it('тип вне широкого списка — 415 с перечнем принимаемых', async () => {
      const agent = await fixture.signIn();
      const response = await upload(agent, { uploadType: 'video/x-msvideo' }).expect(415);

      expect(response.body.code).toBe(RECORDING_TYPE_NOT_ACCEPTED);
      expect(response.body.acceptedTypes.length).toBeGreaterThan(0);
    });

    it('видео без ffmpeg — 409, а не 415', async () => {
      // Формат законен, негодна установка. `415` сказал бы «такого формата
      // не бывает», и человек пошёл бы искать другой файл вместо того,
      // чтобы попросить администратора (дизайн, 5.3).
      fixture.extractor.hasFfmpeg = false;

      const agent = await fixture.signIn();
      const response = await upload(agent).expect(409);

      expect(response.body.code).toBe(RECORDING_NEEDS_FFMPEG);
    });

    it('без настроенной службы — 409, и файл на том не ложится', async () => {
      fixture.transcriber.isEnabled = false;

      const agent = await fixture.signIn();
      const response = await upload(agent).expect(409);

      expect(response.body.code).toBe(TRANSCRIBER_DISABLED);
    });

    it('подпись, не совпавшая с объявленным типом, — 400', async () => {
      const agent = await fixture.signIn();
      const response = await upload(agent, {}, PDF).expect(400);

      expect(response.body.code).toBe(RECORDING_NOT_AUDIO);
    });

    it('тело больше предела загрузки — 413 с настоящим числом', async () => {
      // Предел читается **при каждом запросе**: у `express.raw` он
      // читался один раз при подъёме, и про это приходилось извиняться.
      process.env[RECORDING_MAX_BYTES_ENV] = '8';

      const agent = await fixture.signIn();
      const response = await upload(agent).expect(413);

      expect(response.body).toMatchObject({ code: RECORDING_TOO_LARGE, maxBytes: 8 });
    });

    it('без сессии — 401, без выдачи — 404, с чтением хроники — 403', async () => {
      await upload(fixture.anonymous()).expect(401);

      const member = await fixture.signIn('user@cairn.local');

      await upload(member).expect(404);
      await fixture.grant(Section.Chronicle, AccessLevel.Read);
      await upload(member).expect(403);
    });
  });

  describe('очередь, отмена и удаление', () => {
    it('очередь проекта отдаёт незакрытые задачи', async () => {
      const agent = await fixture.signIn();
      const accepted = await upload(agent).expect(202);
      const queue = await agent.get(`${base()}/transcriptions`).expect(200);

      expect(queue.body.map((job: { id: string }) => job.id)).toEqual([accepted.body.id]);
    });

    it('очередь не перехватывается маршрутом саммари по идентификатору', async () => {
      // `GET /transcriptions` и `GET /:id` живут на одном префиксе, и
      // порядок контроллеров в модуле решает, кто из них ответит. Без
      // него ручка очереди отвечала бы `400` про негодный UUID.
      const agent = await fixture.signIn();

      await agent.get(`${base()}/transcriptions`).expect(200);
    });

    it('отмена закрывает задачу, повторная отмена — 409', async () => {
      const agent = await fixture.signIn();
      const accepted = await upload(agent).expect(202);
      const path = `${base()}/transcriptions/${accepted.body.id}/cancel`;
      const cancelled = await agent.post(path).expect(200);

      expect(cancelled.body.state).toBe(TranscriptionState.Failed);
      await agent.post(path).expect(409);
    });

    it('удаление задачи — 204 без тела, чужая задача — 404', async () => {
      const agent = await fixture.signIn();
      const accepted = await upload(agent).expect(202);
      const other = `/projects/${fixture.state.otherProjectId}/summaries/transcriptions/${accepted.body.id}`;

      await agent.delete(other).expect(404);
      await agent.delete(`${base()}/transcriptions/${accepted.body.id}`).expect(204, '');
      await agent.get(`${base()}/transcriptions`).expect(200, []);
    });

    it('повторная расшифровка при идущей — 409 с названным кодом', async () => {
      const { summaryId } = await settled();
      const agent = await fixture.signIn();

      await agent.post(`${base()}/${summaryId}/transcriptions`).expect(202);

      const second = await agent.post(`${base()}/${summaryId}/transcriptions`).expect(409);

      expect(second.body.code).toBe(TRANSCRIPTION_ALREADY_RUNNING);
    });

    it('повторная расшифровка саммари без записи — 409 с кодом записи', async () => {
      const agent = await fixture.signIn();
      const summary = await agent.post(base()).send(SUMMARY_BODY).expect(201);
      const response = await agent
        .post(`${base()}/${summary.body.id}/transcriptions`)
        .expect(409);

      expect(response.body.code).toBe(RECORDING_MISSING);
    });
  });

  describe('отдача дорожки', () => {
    it('отдаёт дорожку потоком с поддержкой перемотки', async () => {
      // Без `Range` перемотка в `<audio>` не работает, а переслушать
      // спорное место — это ровно про перемотку.
      const { summaryId } = await settled();
      const agent = await fixture.signIn();
      const response = await agent
        .get(`${base()}/${summaryId}/recording`)
        .set('Range', 'bytes=0-9')
        .expect(206);

      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(response.body.length).toBe(10);
    });

    it('отдаёт дорожку, а не загруженное видео, и без имени файла', async () => {
      // Отдавать полгигабайта, чтобы услышать спорную фразу, незачем;
      // исходник ручкой не отдаётся вовсе (дизайн, 3.3).
      const { summaryId } = await settled();
      const agent = await fixture.signIn();
      const response = await agent.get(`${base()}/${summaryId}/recording`).expect(200);

      expect(response.headers['content-type']).toContain('audio/ogg');
      expect(response.headers['content-disposition']).toBe('inline');
    });

    it('отсутствующий файл — 404 с названным кодом', async () => {
      // Законный случай: поднялись из копии базы, тома с записями нет.
      const { summaryId, audioPath } = await settled();

      await fixture.db().db.delete(transcriptionJobs).where(eq(transcriptionJobs.audioPath, audioPath));

      const agent = await fixture.signIn();
      const response = await agent.get(`${base()}/${summaryId}/recording`).expect(404);

      expect(response.body.code).toBe(RECORDING_MISSING);
    });

    it('без выдачи на хронику запись не отдаётся', async () => {
      const { summaryId } = await settled();
      const member = await fixture.signIn('user@cairn.local');

      await member.get(`${base()}/${summaryId}/recording`).expect(404);
    });
  });

  describe('настройки службы и общая очередь', () => {
    it('настройки не несут ключа и каталога', async () => {
      const member = await fixture.signIn('user@cairn.local');
      const response = await member.get('/summaries/transcriber').expect(200);

      expect(Object.keys(response.body).sort()).toEqual([
        'acceptedTypes',
        'audioBitrate',
        'canExtract',
        'host',
        'isEnabled',
        'kind',
        'maxSendBytes',
        'maxUploadBytes',
        'model',
      ]);
      expect(transcriberInfoSchema.parse(response.body)).toEqual(response.body);
    });

    it('принимаемый список считает сервер, с учётом ffmpeg', async () => {
      // Вычитать списки в браузере значило бы завести второе место, где
      // живёт правило, и первым же расхождением показать человеку формат,
      // который сервер отвергнет.
      fixture.extractor.hasFfmpeg = false;

      const member = await fixture.signIn('user@cairn.local');
      const response = await member.get('/summaries/transcriber').expect(200);

      expect(response.body.canExtract).toBe(false);
      expect(response.body.acceptedTypes).toHaveLength(3);
      expect(response.body.audioBitrate).toBeNull();
    });

    it('у выключенной службы узла и модели нет', async () => {
      fixture.transcriber.isEnabled = false;

      const member = await fixture.signIn('user@cairn.local');
      const response = await member.get('/summaries/transcriber').expect(200);

      expect(response.body).toMatchObject({ isEnabled: false, host: null, model: null });
      expect(response.body.acceptedTypes).toEqual([]);
    });

    it('очередь по всем проектам пуста, а не 404, без подходящих проектов', async () => {
      // Пустой список — законный ответ, и он ничего не раскрывает.
      const member = await fixture.signIn('user@cairn.local');

      await member.get('/summaries/transcriptions').expect(200, []);
    });

    it('очередь по всем проектам показывает задачи проектов с выдачей', async () => {
      const admin = await fixture.signIn();
      const accepted = await upload(admin).expect(202);

      await fixture.grant(Section.Chronicle, AccessLevel.Write);

      const member = await fixture.signIn('user@cairn.local');
      const response = await member.get('/summaries/transcriptions').expect(200);

      expect(response.body.map((job: { id: string }) => job.id)).toEqual([accepted.body.id]);
      expect(response.body[0].projectName).toBe('Проект');
    });

    it.each(['/summaries/transcriber', '/summaries/transcriptions'])(
      'без сессии %s отвечает 401',
      async (path) => {
        await fixture.anonymous().get(path).expect(401);
      },
    );
  });

  describe('деталь саммари', () => {
    it('несёт запись и последнюю расшифровку', async () => {
      const { summaryId } = await settled();
      const agent = await fixture.signIn();
      const detail = await agent.get(`${base()}/${summaryId}`).expect(200);

      expect(detail.body.recording).toMatchObject({
        bytes: TRACK.length,
        mediaType: 'audio/ogg',
        uploadBytes: MP3.length,
        uploadType: 'audio/mpeg',
        // Исходник убран при укладке текста: у каждого успешного саммари
        // это обычное состояние, и экран обязан сказать о нём правду.
        isSourceRemoved: true,
      });
      expect(detail.body.transcription).toMatchObject({
        id: expect.any(String),
        state: TranscriptionState.Done,
      });
    });

    it('у саммари без записи оба поля пусты', async () => {
      // Текст вставили руками: записи не было вовсе.
      const agent = await fixture.signIn();
      const summary = await agent.post(base()).send(SUMMARY_BODY).expect(201);

      expect(summary.body.recording).toBeNull();
      expect(summary.body.transcription).toBeNull();
    });
  });
});
