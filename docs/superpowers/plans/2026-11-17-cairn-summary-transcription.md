# Расшифровка записи созвона — план реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Человек загружает запись созвона — видео или аудио; фоновая задача со состоянием в базе извлекает из неё звуковую дорожку через `ffmpeg`, отдаёт дорожку внешней службе расшифровки, забирает текст и рождает из него саммари с записью «Хроники»; дальше работает уже существующий поток «текст → задачи → релиз» — не задевая ни одной таблицы первой итерации.

**Architecture:** Шесть частей по возрастанию связности. Сначала контракт и чистые функции — они ничего не ломают и нужны всему остальному. Затем база: одна новая таблица, два перечня, две миграции, репозиторий с проверкой права, хранилище файлов с подкаталогом текущих загрузок и расширение двух существующих уборок. Затем **два порта**: расшифровка (настройки, сборка текста из потока ответов, адаптер SpeechKit) и извлечение (классификация отказов `ffmpeg`, адаптер на дочернем процессе), плюс две чистые функции решений. Затем фоновый прогон под замком в базе с одним тяжёлым шагом за тик, рождение саммари одной транзакцией через чужие репозитории, и ручки с приёмом тела потоком на диск. Затем веб. Напоследок `ffmpeg` в образе, развёртывание, документация и полная проверка.

**Tech Stack:** pnpm workspaces, NestJS, Drizzle + PostgreSQL, zod в `packages/shared`, Next.js 15, TanStack Query, Vitest + React Testing Library, Testcontainers.

**Основание:** `docs/superpowers/specs/2026-11-17-cairn-summary-transcription-design.md`

**Предшественник:** `docs/superpowers/specs/2026-11-16-cairn-summary-task-constructor-design.md` и одноимённый план. Первая итерация слита (коммит `b093d19`); её таблицы, схемы и ручки этот план **не меняет**.

---

## Как работать с этим планом

TDD: сначала падающий тест, затем реализация. Линтера в проекте нет.

| Что | Команда |
|---|---|
| Все тесты | `pnpm test` |
| Точечно API | `cd apps/api && npx vitest run src/путь` |
| Точечно веб | `cd apps/web && npx vitest run src/путь` |
| Точечно контракт | `cd packages/shared && npx vitest run src/путь` |
| Типы | `pnpm typecheck` |
| Миграция по схеме | `cd apps/api && pnpm db:generate` |

**Осторожно с `pnpm --filter ... test -- --run <путь>`**: двойное `--` съедает фильтр, и запускается весь набор, включая Testcontainers. Точечно — через `npx vitest run` из каталога приложения.

Соглашения: компонент до 100 строк в своей директории с `index.ts`, пропсы — `IProps` в `types.ts`, TSDoc на русском, `any` запрещён, массивы и объекты из JSX — в `constants.ts`, значение, использованное дважды, — `enum`, а не union.

**Интеграционные тесты поднимают PostgreSQL через Testcontainers** — нужен работающий docker. Фикстура — `apps/api/test/db-fixture.ts`, привилегии в ней не выдаются намеренно: их выдаёт миграция, которую тест и проверяет.

**Четыре запрета для тестов, и ни один не формальность:**

1. **Ни один тест не ходит в сеть.** Порт расшифровки подменяется заглушкой по токену `TRANSCRIBER`, адаптер проверяется подменённым `fetch`.
2. **Ни один тест не читает настоящий медиафайл.** Подписи контейнеров собираются из байтов в самом тесте (`Uint8Array.from([0x49, 0x44, 0x33, …])`); файлы на диске — во временном каталоге из `os.tmpdir()`, убираемом в `afterEach`.
3. **Ни один тест не запускает `ffmpeg`.** Порт извлечения подменяется заглушкой по токену `AUDIO_EXTRACTOR`; классификация отказов — чистая функция над кодами выхода и заранее записанными строками `stderr`. Тест, зависящий от установленного `ffmpeg`, падал бы у половины разработчиков и в CI.
4. **Сборка веба на Windows падает на `EPERM` при создании symlink** — это известное свойство среды, а не дефект кода (см. память проекта). `pnpm build` на Windows проверяется до этой точки.

### ⚠ Номера миграций в этом плане — не номера, а пример

**`0038` и `0039`, которые встречаются в задаче 5, уже заняты.** На них претендует план настройки служб модели через администрирование (`docs/superpowers/plans/2026-11-17-cairn-model-settings-admin.md`), и владелец решил реализовывать **его первым**. Значит номера достанутся ему, а этой работе — следующие свободные.

Правило, из которого это следует, и оно сильнее любого номера в любом плане:

> **Номер миграции берёт генератор в момент реализации, а не план.** Перед `pnpm db:generate` надо посмотреть, что лежит в `apps/api/drizzle/` **сейчас**, и принять то, что генератор выдал.

И вторая половина правила, без которой первая не работает:

> **Если чужие миграции появились, пока ты работал, — перегенерировать обязательно. Переименовать нельзя.**

Почему переименование не спасает: вместе с `.sql` генератор пишет снапшот в `apps/api/drizzle/meta/`, и снапшот описывает схему **целиком**, а не твою правку. Два снапшота от одного предка текстом не сводятся — `git` сольёт их без конфликта и получит схему, которой никогда не существовало. Переименованный файл при этом выглядит здоровым: номер уникален, журнал цел, миграции применяются. Расходится только снапшот, и выяснится это на следующей генерации, у следующего человека.

**Сегодня на этом уже потеряли работу при слиянии параллельных ветвей.** Это не теоретическая осторожность.

Практически в задаче 5 это значит: номера в путях файлов (`0038_*.sql`, `0039_transcription_privileges.sql`) читать как «две миграции подряд, какие дал генератор», а имя парной миграции привилегий собирать по факту — `<номер+1>_transcription_privileges.sql`. Проверки глазами из шага 2 от номера не зависят вовсе.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/shared/src/schemas/recording-type.ts` | `uploadFamilyOf`, `FAMILY_BY_TYPE`, `RECORDING_HEAD_BYTES` |
| `packages/shared/src/schemas/transcription.ts` | контракт задачи, паспорта, настроек службы, два списка форматов, коды отказов |
| `apps/api/src/db/schema/transcription.ts` | таблица `transcription_jobs` и два `pgEnum` |
| `apps/api/src/summaries/transcription/settings.ts` | разбор тринадцати переменных окружения |
| `apps/api/src/summaries/transcription/job-decision.ts` | что делать с незакрытой задачей (чистая функция) |
| `apps/api/src/summaries/transcription/prepare-decision.ts` | извлекать, отдавать как есть или отказать (чистая функция) |
| `apps/api/src/summaries/transcription/ffmpeg-failure.ts` | классификация отказа `ffprobe`/`ffmpeg` в названный код (чистая функция) |
| `apps/api/src/summaries/transcription/transcript.ts` | сборка текста из потока ответов провайдера (чистая функция) |
| `apps/api/src/summaries/transcription/transcriber.ts` | интерфейс порта расшифровки, токен, `TranscriberFailure` |
| `apps/api/src/summaries/transcription/yandex-speechkit.transcriber.ts` | адаптер SpeechKit v3 |
| `apps/api/src/summaries/transcription/disabled.transcriber.ts` | порт расшифровки выключен |
| `apps/api/src/summaries/transcription/extractor.ts` | интерфейс порта извлечения, токен, `ExtractionFailure` |
| `apps/api/src/summaries/transcription/ffmpeg.extractor.ts` | `ffprobe` и `ffmpeg` дочерним процессом |
| `apps/api/src/summaries/transcription/unavailable.extractor.ts` | извлечение недоступно |
| `apps/api/src/summaries/transcription/recording-store.ts` | файлы на томе: приём потоком в `incoming/`, чтение, удаление, уборка `incoming/` при подъёме |
| `apps/api/src/summaries/transcription/transcription.repository.ts` | задачи расшифровки с проверкой права |
| `apps/api/src/summaries/transcription/transcription.service.ts` | транзакции, журнал, рождение саммари |
| `apps/api/src/summaries/transcription/transcription-runner.service.ts` | фоновый прогон под замком в базе: опрос, извлечение, отправка |
| `apps/api/src/summaries/transcription/transcriptions.controller.ts` | шесть ручек проекта |
| `apps/api/Dockerfile` | `apk add ffmpeg` в ступень `runner` |
| `apps/web/src/components/SummaryForm/readRecording.ts` | размер → расширение → подпись, в браузере |
| `apps/web/src/api/upload-recording.ts` | загрузка на `XMLHttpRequest`: прогресс, отмена, общий разбор отказа |
| `apps/web/src/components/TranscriptionQueue/` | блок очереди расшифровок |
| `apps/web/src/components/SummaryRecording/` | плеер дорожки и «Расшифровать снова» |
| `apps/web/src/api/hooks/useQueryTranscriptions.ts` | очередь и настройки службы |
| `apps/web/src/api/hooks/useMutationTranscription.ts` | загрузка, отмена, удаление, повтор |

### Порядок частей

1. **Чанк 1** — контракт и чистые функции: перечни, распознавание семейства контейнера, два списка форматов, схемы, коды.
2. **Чанк 2** — база и хранилище: таблица, миграции, репозиторий, файлы с `incoming/`, уборка.
3. **Чанк 3** — два порта: настройки, сборка текста, решения, адаптер SpeechKit, `ffmpeg`, заглушки.
4. **Чанк 4** — прогон и ручки.
5. **Чанк 5** — веб.
6. **Чанк 6** — образ, развёртывание, документация, полная проверка.

После чанка 2 ничего не ломается: таблица есть, порты выключены, поток первой итерации работает как работал. После чанка 4 система полезна без веба — запись загружается, из неё извлекается дорожка, она расшифровывается и становится саммари через API.

**Что изменилось по сравнению с первой редакцией плана.** Решение «только аудио» снято (дизайн, блок «Правка от 2026-11-17»), и потому: добавились три задачи (чистая функция `prepareDecision`, порт извлечения с `ffmpeg`, `Dockerfile`), и изменились почти все остальные — перечень состояний, таблица, миграция, хранилище, репозиторий, настройки, решение о задаче, служба, прогон, ручки, обе веб-задачи и развёртывание. Нетронутыми остались только задачи про сборку текста из ответа провайдера, про адаптер SpeechKit в части опроса и про русские названия действий журнала.

---

## Чанк 1: Контракт и чистые функции

### Task 1: Перечни расшифровки

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/enums.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `packages/shared/src/enums.test.ts`, рядом с проверками перечней саммари:

```ts
describe('перечни расшифровки', () => {
  it('вид службы говорит, куда уходит запись', () => {
    expect(Object.values(TranscriberKind)).toEqual(['external', 'local']);
  });

  it('у задачи шесть состояний, и три из них незакрытые', () => {
    // Все три различия — границы, а не оттенки прогресса, и по ним
    // принимается решение при перезапуске API (дизайн, 2.4): в `queued`
    // наружу не ушло ничего и работа не начата, в `extracting` работа
    // идёт у нас, в `sending` байты в пути.
    expect(Object.values(TranscriptionState)).toEqual([
      'queued',
      'extracting',
      'sending',
      'running',
      'done',
      'failed',
    ]);
  });

  it('четвёртого источника хроники не появилось', () => {
    // Расшифрованный текст по происхождению не отличается от
    // вставленного в ту же форму (дизайн, 1.3).
    expect(Object.values(ChronicleSource)).toEqual(['manual', 'webhook', 'summary']);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/enums.test.ts`
Expected: FAIL — `TranscriberKind` и `TranscriptionState` не экспортированы

- [ ] **Step 3: Дописать перечни**

В `packages/shared/src/enums.ts`, после `TaskSuggesterKind`:

```ts
/** Вид службы расшифровки: куда уходит запись созвона. */
export enum TranscriberKind {
  /** Внешний API; первый — Yandex SpeechKit. */
  External = 'external',
  /** Своя служба в контуре. */
  Local = 'local',
}

/**
 * Состояние расшифровки.
 *
 * Состояния различаются **границами**, а не оттенками прогресса: в
 * `queued` наружу не ушло ничего и работа не начата, в `extracting`
 * работа идёт на нашей машине, в `sending` байты в пути. По этим
 * различиям прогон решает, что делать с задачей, увиденной после
 * перезапуска API (дизайн, раздел 2.4): прерванное извлечение
 * повторяется молча, прерванная отправка наружу — нет.
 */
export enum TranscriptionState {
  Queued = 'queued',
  /** Звуковая дорожка извлекается у нас: минуты работы, ничего не уходит. */
  Extracting = 'extracting',
  Sending = 'sending',
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
}
```

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd packages/shared && npx vitest run src/enums.test.ts`
Expected: PASS, включая прежние проверки перечней

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/enums.ts packages/shared/src/enums.test.ts
git commit -m "Завести перечни службы расшифровки и состояний задачи"
```

### Task 2: Распознавание контейнера по подписи

**Files:**
- Create: `packages/shared/src/schemas/recording-type.ts`
- Create: `packages/shared/src/schemas/recording-type.test.ts`

Чистая функция в контракте, а не на сервере: ею пользуется и браузер (до загрузки), и сервер (как то, чему можно верить). Две реализации разошлись бы, и отказ приходил бы в одном месте, а не в другом.

Отвечает функция **семейством контейнера**, а не типом содержимого: `mp4`, `m4a` и `mov` подписью не различаются (у всех `ftyp`), `mkv` и `webm` — тоже (один EBML). Что внутри — звук или видео — говорит `ffprobe`, и это его работа (дизайн, 4.1).

- [ ] **Step 1: Написать падающий тест**

`packages/shared/src/schemas/recording-type.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { UploadFamily, familyAcceptsType, uploadFamilyOf } from './recording-type';

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
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/schemas/recording-type.test.ts`
Expected: FAIL — `Cannot find module './recording-type'`

- [ ] **Step 3: Написать функцию**

`packages/shared/src/schemas/recording-type.ts`: перечень `UploadFamily`, `uploadFamilyOf`, карта `FAMILY_BY_TYPE` и `familyAcceptsType` поверх неё. Внутри — сравнение байтов по смещению, никакого разбора контейнеров сверх подписи. TSDoc обязан назвать четыре решения из раздела 4.1 дизайна: `File.type` доказательством не считается; подпись проверяется, чтобы два гигабайта чужого формата не дотекли на том; семейство — потому что `mp4`/`m4a`/`mov` подписью не различаются; проверка `OpusHead` не исчезла, а переехала в `prepareDecision`.

Сколько байт нужно для решения — экспортируемая константа `RECORDING_HEAD_BYTES = 64`: браузер по ней режет `file.slice`, сервер по ней берёт голову первого куска потока, и второе число разошлось бы с первым.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd packages/shared && npx vitest run src/schemas/recording-type.test.ts`
Expected: PASS, 18 тестов

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/recording-type.ts packages/shared/src/schemas/recording-type.test.ts
git commit -m "Завести распознавание семейства контейнера по подписи"
```

### Task 3: Схемы расшифровки и коды отказов

**Files:**
- Create: `packages/shared/src/schemas/transcription.ts`
- Create: `packages/shared/src/schemas/transcription.test.ts`
- Modify: `packages/shared/src/schemas/summary.ts`
- Modify: `packages/shared/src/schemas/summary.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Написать падающий тест**

`packages/shared/src/schemas/transcription.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { TranscriberKind, TranscriptionState } from '../enums';
import {
  SERVICE_AUDIO_TYPES,
  UPLOAD_TYPES,
  transcriberInfoSchema,
  transcriptionJobSchema,
  transcriptionRequestSchema,
} from './transcription';

const ID = '00000000-0000-0000-0000-000000000001';

/** Задача первой расшифровки: саммари ещё нет, паспорт введён человеком. */
const JOB = {
  id: ID,
  projectId: ID,
  projectName: 'CAIRN',
  summaryId: null,
  occurredOn: '2026-11-17',
  title: 'Созвон по релизу',
  state: TranscriptionState.Running,
  transcriber: TranscriberKind.External,
  model: 'general',
  host: 'stt.api.cloud.yandex.net',
  uploadBytes: 566_231_040,
  uploadType: 'video/mp4',
  audioBytes: 11_534_336,
  audioType: 'audio/ogg',
  hasRecording: true,
  failureCode: null,
  startedAt: '2026-11-17T10:00:00.000Z',
  sentAt: '2026-11-17T10:04:12.000Z',
  finishedAt: null,
};

describe('задача расшифровки', () => {
  it('до рождения саммари несёт паспорт и не несёт ссылки', () => {
    const parsed = transcriptionJobSchema.parse(JOB);

    expect(parsed.summaryId).toBeNull();
    expect(parsed.title).toBe('Созвон по релизу');
  });

  it('у повторной расшифровки есть саммари и нет паспорта', () => {
    // Паспорт саммари — паспорт его записи хроники; второй копии нет.
    const parsed = transcriptionJobSchema.parse({
      ...JOB,
      summaryId: ID,
      occurredOn: null,
      title: null,
    });

    expect(parsed.summaryId).toBe(ID);
    expect(parsed.occurredOn).toBeNull();
  });

  it('помнит, покинула ли запись машину', () => {
    // `sentAt` отдельно от `startedAt`: между ними лежит и очередь, и
    // извлечение, и на вопрос «когда созвон ушёл наружу» отвечает
    // только второе.
    expect(transcriptionJobSchema.parse({ ...JOB, sentAt: null }).sentAt).toBeNull();
  });

  it('помнит, есть ли ещё запись на томе', () => {
    expect(transcriptionJobSchema.parse({ ...JOB, hasRecording: false }).hasRecording).toBe(false);
  });

  it('до извлечения дорожки нет, а загруженное известно', () => {
    // Два разных числа и два разных вопроса: «что загрузили» и «что
    // уйдёт наружу». Одной тройкой колонок это не выражается.
    const parsed = transcriptionJobSchema.parse({
      ...JOB,
      state: TranscriptionState.Extracting,
      audioBytes: null,
      audioType: null,
      sentAt: null,
    });

    expect(parsed.audioBytes).toBeNull();
    expect(parsed.uploadBytes).toBe(566_231_040);
  });

  it('извлечение могло не понадобиться: загруженное и есть дорожка', () => {
    const parsed = transcriptionJobSchema.parse({
      ...JOB,
      uploadType: 'audio/mpeg',
      uploadBytes: 10_000_000,
      audioType: 'audio/mpeg',
      audioBytes: 10_000_000,
    });

    expect(parsed.audioType).toBe(parsed.uploadType);
  });
});

describe('два списка форматов', () => {
  it('служба принимает три контейнера, по документации', () => {
    expect([...SERVICE_AUDIO_TYPES]).toEqual(['audio/mpeg', 'audio/ogg', 'audio/wav']);
  });

  it('загрузка принимает шире, и это ровно то, что закрывает извлечение', () => {
    // Разница между списками и есть смысл ffmpeg в образе.
    expect(UPLOAD_TYPES.length).toBeGreaterThan(SERVICE_AUDIO_TYPES.length);
    for (const type of SERVICE_AUDIO_TYPES) {
      expect(UPLOAD_TYPES).toContain(type);
    }
  });

  it('загрузка принимает mp4 — настоящий формат записей владельца', () => {
    // Решение «только аудио» снято потому, что записи приходят mp4,
    // а mp4 служба не принимает (дизайн, блок правки).
    expect(UPLOAD_TYPES).toContain('video/mp4');
    expect(SERVICE_AUDIO_TYPES).not.toContain('video/mp4');
  });

  it('загрузка принимает m4a, который служба тоже не берёт', () => {
    expect(UPLOAD_TYPES).toContain('audio/mp4');
  });
});

describe('паспорт загружаемой записи', () => {
  it('принимает дату, заголовок и тип', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: '2026-11-17',
        title: 'Созвон',
        uploadType: 'video/mp4',
      }),
    ).not.toThrow();
  });

  it('принимает весь широкий список, а не только то, что умеет установка', () => {
    // Доступность ffmpeg — свойство установки; контракт, прибитый к ней,
    // пришлось бы менять от машины к машине. Отказ при отсутствии
    // ffmpeg приходит кодом recording_needs_ffmpeg, а не ошибкой схемы:
    // это не «прислано негодное», а «эта установка такого не умеет».
    for (const type of UPLOAD_TYPES) {
      expect(() =>
        transcriptionRequestSchema.parse({ occurredOn: '2026-11-17', title: 'С', uploadType: type }),
      ).not.toThrow();
    }
  });

  it('отвергает контейнер вне широкого списка', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: '2026-11-17',
        title: 'Созвон',
        uploadType: 'video/x-msvideo',
      }),
    ).toThrow();
  });

  it('отвергает пустую дату события', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: null,
        title: 'Созвон',
        uploadType: 'video/mp4',
      }),
    ).toThrow();
  });

  it('отвергает заголовок длиннее записи хроники', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: '2026-11-17',
        title: 'я'.repeat(301),
        uploadType: 'video/mp4',
      }),
    ).toThrow();
  });

  it('отвергает лишнее поле', () => {
    expect(() =>
      transcriptionRequestSchema.parse({
        occurredOn: '2026-11-17',
        title: 'Созвон',
        uploadType: 'video/mp4',
        fileName: 'Клиент Б, разбор инцидента.mp4',
      }),
    ).toThrow();
  });
});

describe('настройки службы расшифровки', () => {
  it('называют узел, модель, оба предела и принимаемые контейнеры', () => {
    const parsed = transcriberInfoSchema.parse({
      isEnabled: true,
      kind: TranscriberKind.External,
      host: 'stt.api.cloud.yandex.net',
      model: 'general',
      maxUploadBytes: 2_147_483_648,
      maxSendBytes: 41_943_040,
      canExtract: true,
      acceptedTypes: [...UPLOAD_TYPES],
      audioBitrate: '24k',
    });

    expect(parsed.maxUploadBytes).toBeGreaterThan(parsed.maxSendBytes);
  });

  it('без ffmpeg принимаемый список сужается до того, что берёт служба', () => {
    // Список считает сервер: вычитать его в браузере значило бы завести
    // второе место, где живёт правило, и первым же расхождением
    // показать человеку формат, который сервер отвергнет.
    const parsed = transcriberInfoSchema.parse({
      isEnabled: true,
      kind: TranscriberKind.External,
      host: 'stt.api.cloud.yandex.net',
      model: 'general',
      maxUploadBytes: 2_147_483_648,
      maxSendBytes: 41_943_040,
      canExtract: false,
      acceptedTypes: [...SERVICE_AUDIO_TYPES],
      audioBitrate: null,
    });

    expect(parsed.acceptedTypes).toHaveLength(3);
  });

  it('у выключенной службы узла и модели нет', () => {
    // Называть узел, куда ничего не уходит, значило бы врать подписью.
    const parsed = transcriberInfoSchema.parse({
      isEnabled: false,
      kind: TranscriberKind.External,
      host: null,
      model: null,
      maxUploadBytes: 2_147_483_648,
      maxSendBytes: 41_943_040,
      canExtract: true,
      acceptedTypes: [],
      audioBitrate: '24k',
    });

    expect(parsed.host).toBeNull();
  });
});
```

И в `packages/shared/src/schemas/summary.test.ts` — два теста на расширение деталей:

```ts
describe('деталь саммари: запись созвона', () => {
  it('записи может не быть вовсе: текст вставили руками', () => {
    expect(summaryDetailSchema.parse(DETAIL).recording).toBeNull();
    expect(summaryDetailSchema.parse(DETAIL).transcription).toBeNull();
  });

  it('несёт и размер дорожки, и размер загруженного', () => {
    // Человек загружал видео, а слушает дорожку, и экран обязан сказать
    // это так, чтобы он не удивился (дизайн, 8.5).
    const parsed = summaryDetailSchema.parse({
      ...DETAIL,
      recording: {
        bytes: 11_534_336,
        mediaType: 'audio/ogg',
        uploadBytes: 566_231_040,
        uploadType: 'video/mp4',
        isSourceRemoved: true,
        uploadedAt: '2026-11-17T10:00:00.000Z',
      },
      transcription: { ...JOB, summaryId: DETAIL.id, occurredOn: null, title: null },
    });

    expect(parsed.recording?.bytes).toBe(11_534_336);
    expect(parsed.recording?.uploadBytes).toBe(566_231_040);
    expect(parsed.transcription?.state).toBe(TranscriptionState.Running);
  });

  it('помнит, убран ли исходник', () => {
    // Исходник убирается при укладке текста (решение владельца 2), и
    // экран обязан сказать правду в обоих случаях: у саммари из видео —
    // «исходник убран», у саммари из mp3 — ничего, потому что убирать
    // было нечего (файл один).
    const fromMp3 = summaryDetailSchema.parse({
      ...DETAIL,
      recording: {
        bytes: 10_000_000,
        mediaType: 'audio/mpeg',
        uploadBytes: 10_000_000,
        uploadType: 'audio/mpeg',
        isSourceRemoved: false,
        uploadedAt: '2026-11-17T10:00:00.000Z',
      },
      transcription: null,
    });

    expect(fromMp3.recording?.isSourceRemoved).toBe(false);
  });
});
```

Существующий объект `DETAIL` в этом файле придётся дополнить двумя полями со значением `null` — это сторож того, что расширение не ломает прежние проверки.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd packages/shared && npx vitest run src/schemas/transcription.test.ts src/schemas/summary.test.ts`
Expected: FAIL — `Cannot find module './transcription'`, затем отсутствие полей у `summaryDetailSchema`

- [ ] **Step 3: Написать схемы**

`packages/shared/src/schemas/transcription.ts` — целиком по разделу 4 дизайна: `SERVICE_AUDIO_TYPES`, `UPLOAD_TYPES`, `DEFAULT_MAX_UPLOAD_BYTES`, `DEFAULT_MAX_SEND_BYTES`, `transcriptionJobSchema`, `transcriptionRequestSchema`, `transcriberInfoSchema`, **семнадцать** кодов отказов (одиннадцать из первой редакции плюс шесть про извлечение: `transcription_too_large`, `recording_needs_ffmpeg`, `recording_no_audio_track`, `recording_broken`, `recording_codec_unsupported`, `extraction_failed`, `extraction_timed_out` — за вычетом того, что `recording_too_large` сменил смысл с «предела службы» на «предел загрузки»), типы `z.infer` на каждую схему.

У `UPLOAD_TYPES` TSDoc обязан сказать, **откуда взят состав**: это то, что отдают живые инструменты (Zoom, Meet, Teams — `mp4`; диктофоны — `m4a` и `mp3`; OBS — `mkv`; браузер — `webm`), а не список «всего, что умеет `ffmpeg`».

В `packages/shared/src/schemas/summary.ts` — `recording` и `transcription` в `summaryDetailSchema`, с TSDoc, который называет, **откуда** берутся эти поля: у задачи расшифровки, потому что своих колонок под запись у `summaries` не появилось.

В `packages/shared/src/index.ts` — два экспорта в алфавитном порядке списка: `./schemas/recording-type` и `./schemas/transcription`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd packages/shared && npx vitest run src/schemas`
Expected: PASS — 22 новых теста и все прежние проверки контракта саммари

- [ ] **Step 5: Коммит**

```bash
git add packages/shared/src/schemas/transcription.ts packages/shared/src/schemas/transcription.test.ts packages/shared/src/schemas/summary.ts packages/shared/src/schemas/summary.test.ts packages/shared/src/index.ts
git commit -m "Завести контракт расшифровки записи созвона"
```

---

## Чанк 2: База, хранилище, уборка

### Task 4: Таблица задач расшифровки

**Files:**
- Create: `apps/api/src/db/schema/transcription.ts`
- Create: `apps/api/src/db/schema/transcription.test.ts`
- Modify: `apps/api/src/db/schema/index.ts`

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/db/schema/transcription.test.ts`:

```ts
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { transcriptionJobs } from './transcription';

/** Имена колонок таблицы: по ним проверяется и состав, и его отсутствие. */
function columns(): string[] {
  return getTableConfig(transcriptionJobs).columns.map((column) => column.name);
}

describe('задачи расшифровки', () => {
  it('саммари обнуляемо: первая расшифровка идёт до его рождения', () => {
    // Главное решение дизайна (раздел 2.2): пока текста нет, саммари нет,
    // и ни одна таблица первой итерации не меняется.
    const link = getTableConfig(transcriptionJobs).columns.find(
      (column) => column.name === 'summary_id',
    );

    expect(link?.notNull).toBe(false);
  });

  it('проект назван отдельно от саммари', () => {
    // Право проверяется до появления саммари, значит по проекту.
    expect(columns()).toContain('project_id');
  });

  it('помнит, кто попросил: прогон работает его правом', () => {
    // Системного действующего лица здесь нет: второй путь записи «от
    // системы, без проверки» был бы дыркой в модели прав.
    expect(columns()).toContain('requested_by_subject_id');
  });

  it('текста расшифровки в таблице нет', () => {
    // Текст не задерживается ни на шаг: из порта в память, оттуда в
    // chronicle_entries.content. Вторая копия — ровно то, от чего
    // избавляет отсутствие колонки текста у summaries.
    expect(columns()).not.toContain('text');
    expect(columns()).not.toContain('content');
    expect(columns()).not.toContain('transcript');
  });

  it('две тройки колонок про файлы: загруженное и дорожка', () => {
    // Размер и тип у них разные, и оба нужны: первый отвечает на «что
    // загрузили», второй — на «что ушло наружу». Это различие двух
    // пределов в модели данных (дизайн, 3.6).
    expect(columns()).toEqual(
      expect.arrayContaining([
        'upload_path',
        'upload_bytes',
        'upload_type',
        'audio_path',
        'audio_bytes',
        'audio_type',
      ]),
    );
  });

  it('дорожка обнуляема, загруженное — нет', () => {
    // audio_path is null значит «отдавать службе нечего, работа ещё не
    // сделана», а не «записи нет».
    const audio = getTableConfig(transcriptionJobs).columns.find((c) => c.name === 'audio_bytes');
    const upload = getTableConfig(transcriptionJobs).columns.find((c) => c.name === 'upload_bytes');

    expect(audio?.notNull).toBe(false);
    expect(upload?.notNull).toBe(true);
  });

  it('длительности записи в таблице нет, хотя ffprobe её знает', () => {
    // Колонку никто не читает: предел длительности принадлежит службе,
    // а размер дорожки система знает точно. Колонка, которую никто не
    // читает, — обязанность держать её согласованной бесплатно.
    expect(columns()).not.toContain('duration_seconds');
  });

  it('имени присланного файла в таблице нет', () => {
    // Имена файлов на машинах людей нередко говорят больше, чем
    // содержимое, — решение первой итерации про текстовый файл.
    expect(columns()).not.toContain('file_name');
    expect(columns()).not.toContain('original_name');
  });

  it('пути к файлам обнуляемы: файлов может уже не быть', () => {
    // У upload_path это обычное состояние, а не краевое: исходник
    // убирается при укладке текста (решение владельца 2), значит у
    // каждого успешного саммари он пуст.
    for (const name of ['upload_path', 'audio_path']) {
      const column = getTableConfig(transcriptionJobs).columns.find((c) => c.name === name);

      expect(column?.notNull).toBe(false);
    }
  });

  it('размер и тип загруженного остаются после удаления файла', () => {
    // После решения об уборке исходника это уже не
    // предусмотрительность, а обязанность: у каждого успешного саммари
    // исходника нет, и единственный ответ на «что я загружал» — эти
    // две колонки.
    for (const name of ['upload_bytes', 'upload_type']) {
      const column = getTableConfig(transcriptionJobs).columns.find((c) => c.name === name);

      expect(column?.notNull).toBe(true);
    }
  });

  it('помнит узел, куда ушла запись, и не помнит ключа', () => {
    expect(columns()).toContain('host');
    expect(columns()).not.toContain('api_key');
    expect(columns()).not.toContain('folder_id');
  });

  it('отличает момент приёма от момента отправки', () => {
    expect(columns()).toEqual(expect.arrayContaining(['started_at', 'sent_at', 'finished_at']));
  });

  it('ссылки не каскадные: уборка явная', () => {
    const cascading = getTableConfig(transcriptionJobs).foreignKeys.filter(
      (key) => key.onDelete !== 'restrict',
    );

    expect(cascading).toEqual([]);
  });

  it('одна незакрытая расшифровка на саммари', () => {
    // Образец — address_incidents_open: правило живёт в базе, а не в
    // памяти процесса, и перезапуск API его не теряет.
    const active = getTableConfig(transcriptionJobs).indexes.find(
      (index) => index.config.name === 'transcription_jobs_active',
    );

    expect(active?.config.unique).toBe(true);
    expect(active?.config.where).toBeDefined();
  });

  it('предикат уникума перечисляет все три незакрытых состояния', () => {
    // Пропусти extracting — и во время извлечения можно было бы
    // запустить вторую расшифровку того же саммари.
    const active = getTableConfig(transcriptionJobs).indexes.find(
      (index) => index.config.name === 'transcription_jobs_active',
    );

    for (const state of ['queued', 'extracting', 'sending', 'running']) {
      expect(String(active?.config.where)).toContain(state);
    }
  });

  it('очередь прогона читается своим индексом', () => {
    const queue = getTableConfig(transcriptionJobs).indexes.find(
      (index) => index.config.name === 'transcription_jobs_queue',
    );

    expect(queue?.config.unique).toBe(false);
  });
});
```

Способ прочитать `notNull`, `onDelete` и `config.where` подогнать под то, как это делают соседние тесты схем (`grep -n "getTableConfig" apps/api/src/db/schema/*.test.ts`) — выражения выше написаны по смыслу, не по готовому образцу.

**Отдельно про предикат частичного индекса:** `config.where` у drizzle — объект `SQL`, а не строка, и `String(...)` на нём может дать не то, что ожидает тест выше. Если у соседних тестов образца чтения предиката нет, проверку состава состояний надо делать **не здесь, а в интеграционном тесте миграции** (Task 5, шаг 6): там предикат проверяется по поведению — вторая незакрытая задача не вставляется, — и это сильнее, чем сравнение строк. Тогда из этого файла проверка «предикат перечисляет все три» убирается, а её место занимает запись в Task 5. Выбор между двумя способами — за тем, кто увидит, что умеют соседние тесты; дублировать проверку в обоих местах не нужно.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/db/schema/transcription.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать схему**

`apps/api/src/db/schema/transcription.ts` — таблица и два `pgEnum` по разделу 2.1 дизайна. Обязательные места в TSDoc:

- почему `summary_id` обнуляемо (раздел 2.2 дизайна, кратко: саммари рождается из готового текста, и таблицы первой итерации не меняются);
- почему состояний шесть, а не пять: все различия — **границы**, а не оттенки прогресса, и по ним решается судьба задачи при перезапуске;
- **почему две тройки колонок про файлы** (раздел 2.1): до службы едет не загруженный файл, а дорожка, и мерить их одним размером нельзя;
- **тонкость уникума**: `NULL` в уникальном индексе PostgreSQL не конфликтует с `NULL`, поэтому первых расшифровок у проекта может идти сколько угодно, и это ровно нужное поведение — защищается только «две расшифровки, пишущие в один `content`»;
- почему `transcriber` — `pgEnum`, тогда как `summaries.suggester_name` — `text`.

Предикат частичного индекса — `sql` с перечислением **четырёх** незакрытых состояний (`queued`, `extracting`, `sending`, `running`), по образцу `address_incidents_open`.

В `apps/api/src/db/schema/index.ts` — `export * from './transcription';` в алфавитном порядке.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/db/schema/transcription.test.ts`
Expected: PASS, 16 тестов (либо 15, если проверка предиката уехала в Task 5)

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/db/schema/transcription.ts apps/api/src/db/schema/transcription.test.ts apps/api/src/db/schema/index.ts
git commit -m "Завести таблицу задач расшифровки"
```

### Task 5: Миграции

**Files:**
- Create: `apps/api/drizzle/<N>_*.sql` (номер и имя даёт drizzle-kit)
- Create: `apps/api/drizzle/<N+1>_transcription_privileges.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/test/db-fixture.ts`

**Номер здесь — `<N>`, а не `0038`**, и это не формальность: `0038`/`0039` достанутся плану настройки служб модели, который реализуется раньше (см. блок «Номера миграций» наверху плана). Посмотри, что лежит в `apps/api/drizzle/` сейчас, и возьми то, что дал генератор.

- [ ] **Step 1: Сгенерировать миграцию по схеме**

Run: `cd apps/api && ls drizzle/*.sql | tail -4 && pnpm db:generate`
Expected: появился `drizzle/<N>_<слово>.sql` и запись в `meta/_journal.json`. Номер — следующий за тем, что показал `ls`; если он не совпал с ожидаемым, значит кто-то успел раньше, и это нормально.

- [ ] **Step 2: Прочитать сгенерированное и проверить глазами**

Run: `cat apps/api/drizzle/*_transcription*.sql` (или по номеру, который выдал генератор)

Обязательно должно быть:

- `CREATE TYPE "transcriber_kind" AS ENUM('external', 'local');`
- `CREATE TYPE "transcription_state" AS ENUM('queued', 'extracting', 'sending', 'running', 'done', 'failed');`
- `CREATE TABLE "transcription_jobs"` со всеми четырьмя ссылками `on delete restrict` и **обеими тройками** колонок про файлы;
- **частичный уникальный индекс** с `WHERE "state" in ('queued','extracting','sending','running')`. Два способа испортить его, и оба проверяются глазами: если `WHERE` потерялся целиком, уникум запретил бы вторую расшифровку по саммари навсегда, а не на время идущей; если в списке **не хватает `extracting`**, во время извлечения можно было бы запустить вторую расшифровку того же саммари, и две из них писали бы в один `content`;
- второй частичный индекс очереди (с тем же списком состояний) и индекс по проекту.

- [ ] **Step 3: Написать миграцию привилегий**

`apps/api/drizzle/<N+1>_transcription_privileges.sql` — номер на единицу больше того, что выдал генератор на шаге 1. По образцу `0036_summary_privileges.sql`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON
  transcription_jobs
TO cairn_app;
```

Зарегистрировать её в `apps/api/drizzle/meta/_journal.json` вручную по образцу соседних записей (`idx` на единицу больше, `tag` — имя файла без расширения, `when` — текущая метка времени в миллисекундах, `breakpoints: true`).

**Если к этому моменту в каталоге появилась чужая миграция** (кто-то слил свою ветвь, пока ты писал привилегии) — не переименовывать ни свою структурную, ни эту. Откатить обе, обновить рабочую копию и **перегенерировать структурную заново**; привилегии переписать с новым номером. Причина — в блоке «Номера миграций» наверху плана: расходится снапшот, а не `.sql`, и переименование это прячет.

- [ ] **Step 4: Дополнить фикстуру**

В `apps/api/test/db-fixture.ts` добавить `transcription_jobs` в `TRUNCATE`, **детьми первыми** — перед `summary_task_drafts` и `summaries`.

- [ ] **Step 5: Прогнать интеграционный тест, который применяет миграции**

Run: `cd apps/api && npx vitest run src/db/schema/invariants.test.ts`
Expected: PASS — миграции применились в контейнере без ошибок

- [ ] **Step 6: Добавить интеграционную проверку уникума**

В том же `invariants.test.ts` (или рядом, по месту, где проверяются уникумы инцидентов):

```ts
it('вторая незакрытая расшифровка по саммари не вставляется', async () => {
  await insertJob({ summaryId, state: TranscriptionState.Running });

  await expect(insertJob({ summaryId, state: TranscriptionState.Queued })).rejects.toThrow();
});

it('после закрытия первой вторая вставляется', async () => {
  // «Расшифровать снова» обязано работать: иначе уникум запрещал бы не
  // гонку, а саму возможность повторить.
  await insertJob({ summaryId, state: TranscriptionState.Failed });

  await expect(insertJob({ summaryId, state: TranscriptionState.Queued })).resolves.toBeDefined();
});

it('первых расшифровок без саммари может идти несколько', async () => {
  // NULL в уникуме не конфликтует с NULL — это ровно нужное поведение:
  // три загруженные записи это три будущих саммари.
  await insertJob({ summaryId: null, state: TranscriptionState.Queued });

  await expect(
    insertJob({ summaryId: null, state: TranscriptionState.Queued }),
  ).resolves.toBeDefined();
});

it('во время извлечения вторая расшифровка не вставляется', async () => {
  // Сторож предиката: если `extracting` выпадет из списка состояний,
  // этот тест — единственное, что это заметит, и он поймает самую
  // дорогую ошибку (два ffmpeg и две записи в один content).
  await insertJob({ summaryId, state: TranscriptionState.Extracting });

  await expect(insertJob({ summaryId, state: TranscriptionState.Queued })).rejects.toThrow();
});
```

Run: `cd apps/api && npx vitest run src/db/schema/invariants.test.ts`
Expected: PASS

- [ ] **Step 7: Коммит**

```bash
git add apps/api/drizzle apps/api/test/db-fixture.ts apps/api/src/db/schema
git commit -m "Применить таблицу расшифровок миграцией"
```

### Task 6: Хранилище записей на томе

**Files:**
- Create: `apps/api/src/summaries/transcription/recording-store.ts`
- Create: `apps/api/src/summaries/transcription/recording-store.test.ts`

Файлы, а не база: ежедневная копия `pg_dump` не должна вырасти с мегабайтов до гигабайтов (дизайн, раздел 3.1). И **поток, а не буфер**: два гигабайта в куче процесса, который делит машину с PostgreSQL, вебом и прокси, — это не граница, а падение (раздел 5.2).

- [ ] **Step 1: Написать падающий тест**

Временный каталог из `os.tmpdir()`, убираемый в `afterEach`; настоящих медиафайлов нет — байты собираются в тесте, поток строится из `Readable.from([...])`.

```ts
describe('хранилище записей', () => {
  it('принимает поток в incoming, потом переносит на место', async () => {
    // Путь попадает в таблицу только после переноса — на этом стоит
    // право убирать incoming/ целиком при подъёме (дизайн, 2.5 п.5).
    const saved = await store.accept(JOB_ID, 'video/mp4', Readable.from([MP4_HEAD, TAIL]), MAX);

    expect(saved.path).toBe(`${JOB_ID}.mp4`);
    expect(await lsIncoming()).toEqual([]);
  });

  it('считает байты по ходу, а не верит Content-Length', async () => {
    // Заголовку верить нельзя: он может и соврать, и отсутствовать.
    await expect(
      store.accept(JOB_ID, 'video/mp4', Readable.from([MP4_HEAD, BIG_TAIL]), 1024),
    ).rejects.toMatchObject({ code: RECORDING_TOO_LARGE });
  });

  it('перебор предела убирает недописанный файл', async () => {
    await expect(store.accept(JOB_ID, 'video/mp4', tooBig(), 1024)).rejects.toThrow();

    expect(await lsIncoming()).toEqual([]);
    expect(await lsRecordings()).toEqual([]);
  });

  it('негодная подпись обрывает приём на первом куске', async () => {
    // Два гигабайта чужого формата на том не попадают: проверяется
    // голова первого куска, дальше поток разрушается.
    const stream = Readable.from([PDF_HEAD, BIG_TAIL]);

    await expect(store.accept(JOB_ID, 'video/mp4', stream, MAX)).rejects.toMatchObject({
      code: RECORDING_NOT_AUDIO,
    });
    expect(stream.destroyed).toBe(true);
  });

  it('обрыв связи убирает недописанный файл', async () => {
    // Единственное место в системе, где уборка идёт в finally, а не
    // после фиксации: строки в базе ещё нет, фиксировать нечего.
    await expect(store.accept(JOB_ID, 'video/mp4', brokenStream(), MAX)).rejects.toThrow();

    expect(await lsIncoming()).toEqual([]);
  });

  it('кладёт запись под именем задачи, а не под присланным', async () => {
    // Присланное имя мы не получаем вовсе; расширение выводится из типа,
    // чтобы файл, вытащенный с тома руками, открылся плеером.
    const saved = await store.accept(JOB_ID, 'audio/mpeg', Readable.from([ID3, TAIL]), MAX);

    expect(saved.path).toBe(`${JOB_ID}.mp3`);
  });

  it('дорожка кладётся своим именем рядом с загруженным', async () => {
    // Два файла на задачу: собьются расширениями, но не именами.
    expect(store.audioNameOf(JOB_ID)).toBe(`${JOB_ID}.opus`);
  });

  it('не выходит за пределы каталога записей', async () => {
    // Путь строится из идентификатора задачи, но проверка стоит всё
    // равно: хранилище не должно становиться способом прочитать что
    // угодно — а теперь оно отдаёт файлы наружу ручкой.
    await expect(store.read('../../etc/passwd')).rejects.toThrow();
    await expect(store.read('/etc/passwd')).rejects.toThrow();
  });

  it('отсутствующий файл читается названным отказом', async () => {
    // Законный случай: поднялись из копии базы, тома с записями нет.
    await expect(store.read('нет-такого.mp3')).rejects.toThrow(RECORDING_MISSING);
  });

  it('удаление отсутствующего файла ошибкой не считается', async () => {
    // ENOENT значит «уже убран», и это не повод валить уборку саммари.
    await expect(store.remove('нет-такого.mp3')).resolves.toBeUndefined();
  });

  it('создаёт каталоги, если их нет', async () => {
    // Том монтируется пустым; падать на первой загрузке незачем.
    await expect(store.accept(JOB_ID, 'audio/wav', Readable.from([WAV]), MAX)).resolves.toBeDefined();
  });

  it('отдаёт абсолютный путь для потоковой отдачи', async () => {
    // res.sendFile требует абсолютный путь и сам ставит Accept-Ranges.
    expect(isAbsolute(store.absolutePathOf(`${JOB_ID}.opus`))).toBe(true);
  });

  it('убирает incoming целиком при подъёме', async () => {
    // После перезапуска в incoming/ заведомо ничего живого нет: живых
    // запросов у нового процесса не бывает, а в таблицу путь попадает
    // только после переноса.
    await writeIncoming('брошенный.part');

    await store.sweepIncoming();

    expect(await lsIncoming()).toEqual([]);
  });

  it('уборка incoming не трогает готовые записи', async () => {
    await store.accept(JOB_ID, 'audio/wav', Readable.from([WAV]), MAX);

    await store.sweepIncoming();

    expect(await lsRecordings()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/recording-store.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать хранилище**

Семь методов: `accept(jobId, uploadType, stream, maxBytes): Promise<{path, bytes}>`, `audioNameOf(jobId): string`, `read(relative): Promise<Buffer>`, `absolutePathOf(relative): string`, `remove(relative): Promise<void>`, `sweepIncoming(): Promise<void>`, и `size(relative): Promise<number>` для размера извлечённой дорожки.

Устройство `accept` — ровно пять шагов раздела 5.2 дизайна: поток в `incoming/<uuid>.part` → подсчёт байтов по ходу → подпись первого куска → `rename` на место. Каждый отказ обязан убрать недописанный файл **в `finally`**.

Каталог берётся из `CAIRN_RECORDINGS_DIR` **при каждом вызове** (как настройки порта), чтобы тесты могли его подменить. Проверка выхода за каталог — через `path.resolve` и сравнение с корнем, не через поиск `..` в строке.

`sweepIncoming` зовётся из `onModuleInit` службы, а не из конструктора: подъём приложения не должен зависеть от порядка создания провайдеров.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription/recording-store.test.ts`
Expected: PASS, 13 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription/recording-store.ts apps/api/src/summaries/transcription/recording-store.test.ts
git commit -m "Принимать запись созвона потоком на том"
```

### Task 7: Репозиторий задач расшифровки

**Files:**
- Create: `apps/api/src/summaries/transcription/transcription.repository.ts`
- Create: `apps/api/src/summaries/transcription/transcription.repository.test.ts`

Интеграционный тест на `startTestDatabase()`; подготовку данных брать из `apps/api/src/summaries/summaries.repository.test.ts` — там уже есть проект, субъекты и выдачи всех нужных уровней.

- [ ] **Step 1: Написать падающий тест**

```ts
describe('репозиторий расшифровок', () => {
  it('заводит задачу правом записи на хронику', async () => {
    const job = await repository.create(writer, tx, projectId, INPUT);

    expect(job.state).toBe(TranscriptionState.Queued);
    expect(job.summaryId).toBeNull();
    expect(job.sentAt).toBeNull();
  });

  it('уровня чтения хроники не хватает', async () => {
    // Загрузка записи открывается тем же правом, что создание саммари.
    await expect(repository.create(reader, tx, projectId, INPUT)).rejects.toThrow(
      InsufficientLevelError,
    );
  });

  it('без выдачи на хронику проект не раскрывается', async () => {
    await expect(repository.create(outsider, tx, projectId, INPUT)).rejects.toThrow(
      SectionNotVisibleError,
    );
  });

  it('задача чужого проекта выглядит несуществующей', async () => {
    // Выборка по (id, project_id), как requireEntry в хронике.
    await expect(repository.findById(writer, otherProjectId, jobId)).rejects.toThrow(
      SectionNotVisibleError,
    );
  });

  it('повторная расшифровка берёт дорожку у первой, а не копирует файл', async () => {
    // У саммари, дошедшего до done, исходника уже нет (решение
    // владельца 2) — и это обычный случай, а не краевой: повтор
    // работает с дорожкой. Подсчёта ссылок нет, путь берётся как есть.
    const again = await repository.createForSummary(writer, tx, projectId, summaryId);

    expect(again.audioPath).toBe(firstJob.audioPath);
    expect(again.uploadPath).toBeNull();
    expect(again.occurredOn).toBeNull();
  });

  it('если исходник ещё есть, повтор наследует и его', async () => {
    // Такое бывает у саммари, чей текст уложен не первой попыткой: до
    // done исходник на месте, и новая задача несёт оба пути.
    const again = await repository.createForSummary(writer, tx, projectId, summaryBeforeDone);

    expect(again.uploadPath).toBe(firstJob.uploadPath);
  });

  it('повтор без дорожки отвергается, а без исходника — нет', async () => {
    // Спутать эти два случая значит сломать повтор навсегда: пустой
    // upload_path — обычное состояние, пустой audio_path — отказ.
    await expect(
      repository.createForSummary(writer, tx, projectId, summaryWithoutAudio),
    ).rejects.toThrow(RECORDING_MISSING);
  });

  it('повторная расшифровка при идущей отвергается', async () => {
    await expect(
      repository.createForSummary(writer, tx, projectId, summaryId),
    ).rejects.toThrow(TRANSCRIPTION_ALREADY_RUNNING);
  });


  it('очередь проекта отдаёт незакрытые и неудавшиеся, без done', async () => {
    // Успешная расшифровка видна саммари в истории; две строки об одном
    // были бы двумя правдами.
    const queue = await repository.findQueue(writer, projectId);

    expect(queue.map((job) => job.state)).toEqual([
      TranscriptionState.Running,
      TranscriptionState.Failed,
    ]);
  });

  it('очередь по всем проектам фильтруется выдачами на хронику', async () => {
    // Функция доступа существующая: projectIdsWithLevel завела первая
    // итерация, новой не появляется.
    const queue = await repository.findOverview(chronicleOnlyWriter);

    expect(queue.every((job) => job.projectId === writableProjectId)).toBe(true);
  });

  it('отдаёт прогону незакрытые задачи без субъекта, старые первыми', async () => {
    // Прогон — не субъект: он собирает RequestSubject по
    // requested_by_subject_id и дальше работает им.
    const pending = await repository.pending(tx);

    expect(pending.map((job) => job.id)).toEqual([olderJobId, newerJobId]);
  });

  it('переход в extracting захватывает работу, не трогая sentAt', async () => {
    // Захват, а не журналирование: наружу ничего не уходит, но без него
    // два тика двух экземпляров API запустили бы два ffmpeg на один
    // файл и писали бы в один и тот же выходной путь.
    await repository.markExtracting(tx, jobId);

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.state).toBe(TranscriptionState.Extracting);
    expect(row?.sentAt).toBeNull();
  });

  it('готовая дорожка записывается вместе с возвратом в очередь', async () => {
    // Одной транзакцией: audio_* без возврата в queued читались бы как
    // «дорожка есть, а работа висит».
    await repository.markExtracted(tx, jobId, { path: 'j.opus', bytes: 11_534_336, type: 'audio/ogg' });

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.state).toBe(TranscriptionState.Queued);
    expect(row?.audioBytes).toBe(11_534_336);
  });

  it('переход в sending невозможен без дорожки', async () => {
    // Охрана инварианта «наружу уходит только то, что лежит в
    // audio_path». Решение принимает prepareDecision, но забыть
    // решение можно, а охрану — нет.
    await expect(
      repository.markSending(tx, jobWithoutAudio, { host: 'stt.api.cloud.yandex.net' }),
    ).rejects.toThrow();
  });

  it('переход в sending ставит момент отправки', async () => {
    await repository.markSending(tx, jobId, { host: 'stt.api.cloud.yandex.net' });

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.state).toBe(TranscriptionState.Sending);
    expect(row?.sentAt).not.toBeNull();
  });

  it('переход в running требует идентификатора операции', async () => {
    // Строка running без external_id — строка, которую нечем опросить.
    await expect(repository.markRunning(tx, jobId, '')).rejects.toThrow();
  });

  it('закрытие неудачей пишет код и момент', async () => {
    await repository.markFailed(tx, jobId, TRANSCRIPTION_TIMED_OUT);

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.failureCode).toBe(TRANSCRIPTION_TIMED_OUT);
    expect(row?.finishedAt).not.toBeNull();
  });

  it('укладка текста обнуляет путь исходника и отдаёт его вызывающему', async () => {
    // Исходник убирается при переходе в done (решение владельца 2).
    // Колонка обнуляется в транзакции, unlink идёт после фиксации —
    // поэтому путь возвращается наружу, а не удаляется здесь.
    const removed = await repository.markDone(tx, jobId);

    expect(removed.sourcePath).toBe(`${jobId}.mp4`);

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.state).toBe(TranscriptionState.Done);
    expect(row?.uploadPath).toBeNull();
    expect(row?.audioPath).toBe(`${jobId}.opus`);
    expect(row?.uploadBytes).toBe(566_231_040);
  });

  it('не отдаёт на уборку единственный файл', async () => {
    // Загруженный mp3 и есть дорожка: убрать его значило бы унести
    // единственную запись саммари — тихо и необратимо.
    const removed = await repository.markDone(tx, passThroughJob);

    expect(removed.sourcePath).toBeNull();

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.audioPath).not.toBeNull();
  });

  it('у повторной расшифровки убирать нечего: исходника нет с первого успеха', async () => {
    // Повтор работает с дорожкой, и это не краевой случай, а обычный.
    const removed = await repository.markDone(tx, repeatJob);

    expect(removed.sourcePath).toBeNull();
  });

  it('удаление задачи отдаёт пути файлов вызывающему', async () => {
    // Файлы удаляются после фиксации транзакции, не внутри: удаление
    // файла не откатывается.
    const removed = await repository.remove(writer, tx, projectId, jobId);

    expect(removed.mediaPaths).toEqual([`${jobId}.mp4`, `${jobId}.opus`]);
    expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(0);
  });

  it('у закончившейся задачи остаётся один путь — дорожка', async () => {
    // Исходник убран на done, и это нормальный случай, а не краевой:
    // у живого саммари, как правило, удалять нечего, кроме дорожки.
    const removed = await repository.remove(writer, tx, projectId, doneJob);

    expect(removed.mediaPaths).toEqual([`${doneJob}.opus`]);
  });

  it('пути схлопываются, когда извлечения не было', async () => {
    // Загруженный mp3 и есть дорожка: удалять по одному пути дважды
    // нечего.
    const removed = await repository.remove(writer, tx, projectId, passThroughJob);

    expect(removed.mediaPaths).toHaveLength(1);
  });

  it('у удалённой записи оба пути обнуляются, а размер остаётся', async () => {
    await repository.forgetMedia(tx, jobId);

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.uploadPath).toBeNull();
    expect(row?.audioPath).toBeNull();
    expect(row?.uploadBytes).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/transcription.repository.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать репозиторий**

Субъект первым аргументом у всех ручек, кроме `pending` и переходов состояний: их зовёт прогон, у которого субъекта на этом шаге нет (он собирает его отдельно и зовёт им **репозитории записи** — хронику и саммари). Это надо назвать в TSDoc прямо, иначе следующий читатель решит, что проверку забыли.

Две охраны инвариантов, и обе не из вежливости:

- `markRunning` отвергает пустой `external_id`: строка `running` без него необслуживаема;
- `markSending` отвергает задачу с пустым `audio_path`: наружу уходит только то, что лежит в `audio_path`, и это второе место, где правило держится (первое — `prepareDecision`). Решение можно переписать, охрану забыть нельзя.

`markDone(tx, jobId)` — **единственный** метод, обнуляющий `upload_path`, и он же единственное место, где живёт сравнение путей:

```
если upload_path пуст             → sourcePath = null (убирать нечего)
если upload_path === audio_path   → sourcePath = null (файл один, 2.1)
иначе                             → обнулить upload_path, вернуть его как sourcePath
```

Возвращает путь, а не удаляет файл: `unlink` обязан идти **после** фиксации транзакции, и делает его служба (Task 13). TSDoc обязан назвать и это, и то, что ни один другой переход состояния `upload_path` не трогает — иначе правило «исходник переживает любую неудачу» держалось бы на внимательности.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription/transcription.repository.test.ts`
Expected: PASS, 28 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription/transcription.repository.ts apps/api/src/summaries/transcription/transcription.repository.test.ts
git commit -m "Завести репозиторий задач расшифровки"
```

### Task 8: Уборка в двух существующих местах

**Files:**
- Modify: `apps/api/src/summaries/summaries.repository.ts`
- Modify: `apps/api/src/summaries/summaries.repository.test.ts`
- Modify: `apps/api/src/chronicle/chronicle.repository.ts`
- Modify: `apps/api/src/chronicle/chronicle.repository.test.ts`
- Modify: `apps/api/src/summaries/summaries.service.ts`
- Modify: `apps/api/src/chronicle/chronicle.service.ts`

Ссылки `restrict`, значит без явной уборки саммари с расшифровкой стало бы неудаляемым, а запись хроники за ним — тоже. Это **единственная** правка кода первой итерации во всём изменении.

- [ ] **Step 1: Написать падающий тест**

В `summaries.repository.test.ts`:

```ts
it('удаление саммари уносит его расшифровки', async () => {
  await repository.remove(writer, tx, projectId, summaryId);

  expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(0);
});

it('удаление саммари отдаёт пути записей вызывающему', async () => {
  // Файлы удаляются после фиксации: удаление файла не откатывается, и
  // обратный порядок унёс бы запись у саммари, удаление которого потом
  // откатилось.
  const removed = await repository.remove(writer, tx, projectId, summaryId);

  expect(removed.mediaPaths).toEqual([`${jobId}.mp4`, `${jobId}.opus`]);
});

it('несколько попыток по одним файлам дают два пути, а не четыре', async () => {
  // Повторная расшифровка не копирует запись: пути у попыток
  // одинаковы, и удалять дважды нечего.
  const removed = await repository.remove(writer, tx, projectId, summaryWithTwoJobs);

  expect(removed.mediaPaths).toHaveLength(2);
});

it('без извлечения путь один: загруженное и есть дорожка', async () => {
  const removed = await repository.remove(writer, tx, projectId, summaryFromMp3);

  expect(removed.mediaPaths).toHaveLength(1);
});

it('у саммари с уложенным текстом путь один: исходник уже убран', async () => {
  // Обычный случай, а не краевой: исходник уносится при переходе в
  // done (решение владельца 2), и у живого саммари остаётся дорожка.
  const removed = await repository.remove(writer, tx, projectId, releasedSummary);

  expect(removed.mediaPaths).toEqual([`${jobId}.opus`]);
});
```

В `chronicle.repository.test.ts`:

```ts
it('удаление записи уносит расшифровки её саммари', async () => {
  // Они дети саммари, и без них удаление упёрлось бы в целостность.
  await repository.remove(writer, tx, projectId, entryId);

  expect(await testDb.rowsOf(transcriptionJobs)).toHaveLength(0);
  expect(await testDb.rowsOf(summaries)).toHaveLength(0);
});

it('удаление записи отдаёт пути файлов созвонов', async () => {
  const removed = await repository.remove(writer, tx, projectId, entryId);

  expect(removed.mediaPaths).toEqual([`${jobId}.mp4`, `${jobId}.opus`]);
});
```

И по одному тесту на службы — что файлы убираются **после** фиксации:

```ts
it('файл убирается после фиксации транзакции, а не внутри', async () => {
  // Порядок обязателен: сначала commit, потом unlink. Проверяется
  // подменённым хранилищем, которое помнит момент вызова.
  await service.remove(writer, projectId, summaryId);

  expect(store.removedAfterCommit).toBe(true);
});

it('сбой удаления файла не валит удаление саммари', async () => {
  // Осиротевший файл виден предупреждением в логе, места занимает
  // столько же и данных не раскрывает. Откатывать удаление из-за него
  // значило бы сделать саммари неудаляемым из-за файла.
  store.failOnRemove = true;

  await expect(service.remove(writer, projectId, summaryId)).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/summaries.repository.test.ts src/chronicle/chronicle.repository.test.ts`
Expected: FAIL — `mediaPaths` в возвращаемом значении нет

- [ ] **Step 3: Расширить уборку**

В обоих репозиториях: перед удалением саммари уносятся `transcription_jobs`, а пути их файлов возвращаются вызывающему — **множеством**, то есть уникальными и непустыми. Схлопывание обязательно: у задачи две колонки путей, а когда извлечения не было, в них лежит одна и та же строка.

В обеих службах: `store.remove` зовётся **после** `db.transaction`, в `try/catch` с предупреждением в лог, по одному разу на путь.

Отдельной записи в журнал удаление расшифровок **не** получает: человек удалял саммари (или запись хроники), и журнал обязан описывать то, что он сделал. Это та же причина, по которой первая итерация не журналирует уборку саммари при удалении записи.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries src/chronicle`
Expected: PASS, включая все прежние тесты саммари и хроники

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries apps/api/src/chronicle
git commit -m "Уносить записи созвонов вместе с саммари и записью хроники"
```

---

## Чанк 3: Два порта — расшифровка и извлечение

### Task 9: Разбор настроек

**Files:**
- Create: `apps/api/src/summaries/transcription/settings.ts`
- Create: `apps/api/src/summaries/transcription/settings.test.ts`

Образец — `suggester/settings.ts`: значения читаются при каждом вызове, мусор и неположительное означают умолчание.

- [ ] **Step 1: Написать падающий тест**

```ts
describe('настройки расшифровки', () => {
  it('без переменных порт выключен', () => {
    // Умолчание `off`, а не `external`: это выполнение обещания раздела
    // 6.2 первой итерации, и цена ошибки здесь выше — наружу уходит не
    // выжимка, а всё сказанное.
    expect(transcriberSettings().isEnabled).toBe(false);
    expect(transcriberSettings().kind).toBe(TranscriberKind.External);
  });

  it('внешнему нужны и ключ, и каталог', () => {
    // x-folder-id у SpeechKit не опционален: порт, включённый
    // наполовину, отказывал бы на каждом вызове вместо честной
    // выключенной кнопки.
    process.env.CAIRN_TRANSCRIBER = 'external';
    process.env.CAIRN_TRANSCRIBER_API_KEY = 'ключ';

    expect(transcriberSettings().isEnabled).toBe(false);

    process.env.CAIRN_TRANSCRIBER_FOLDER_ID = 'каталог';

    expect(transcriberSettings().isEnabled).toBe(true);
  });

  it('у external есть умолчание адреса, у local — нет', () => {
    // Подставить внешний адрес локальной установке значило бы тихо
    // отправить запись наружу: подмена названной границы.
    process.env.CAIRN_TRANSCRIBER = 'local';

    expect(transcriberSettings().baseUrl).toBe('');
  });

  it('пустая строка читается как отсутствие, а не как адрес', () => {
    // compose передаёт необъявленную переменную пустой строкой
    // (`${VAR:-}`), и на `??` порт оказался бы выключен при вписанном
    // ключе — то есть ровно там, где он настроен.
    process.env.CAIRN_TRANSCRIBER = 'external';
    process.env.CAIRN_TRANSCRIBER_BASE_URL = '   ';

    expect(transcriberSettings().baseUrl).toBe('https://stt.api.cloud.yandex.net');
  });

  it('off выключает при любом ключе', () => {
    process.env.CAIRN_TRANSCRIBER = 'off';
    process.env.CAIRN_TRANSCRIBER_API_KEY = 'ключ';
    process.env.CAIRN_TRANSCRIBER_FOLDER_ID = 'каталог';

    expect(transcriberSettings().isEnabled).toBe(false);
  });

  it('мусор в числах даёт умолчание, а не ноль', () => {
    process.env.CAIRN_TRANSCRIBER_MAX_BYTES = 'сорок';
    process.env.CAIRN_TRANSCRIPTION_MAX_MINUTES = '-5';

    expect(transcriberSettings().maxSendBytes).toBe(41_943_040);
    expect(transcriberSettings().maxMinutes).toBe(120);
  });

  it('два предела читаются порознь и не путаются', () => {
    // До службы едет не загруженный файл, а дорожка; мерить их одним
    // числом значит либо запретить видео, либо пообещать службе то,
    // чего она не примет (дизайн, 3.6).
    process.env.CAIRN_RECORDING_MAX_BYTES = '1000';
    process.env.CAIRN_TRANSCRIBER_MAX_BYTES = '2000';

    expect(transcriberSettings().maxUploadBytes).toBe(1000);
    expect(transcriberSettings().maxSendBytes).toBe(2000);
  });

  it('предел загрузки по умолчанию — два гигабайта', () => {
    // Выведен из чужого предела длительности: четыре часа — самая
    // длинная запись, которую можно распознать, и четыре часа 720p это
    // примерно столько.
    expect(transcriberSettings().maxUploadBytes).toBe(2_147_483_648);
  });

  it('ffmpeg по умолчанию ищется в PATH', () => {
    expect(transcriberSettings().ffmpeg).toBe('auto');
  });

  it('off у ffmpeg выключает извлечение при любом пакете в образе', () => {
    // Отсутствие — обстоятельство, off — решение администратора не
    // нагружать машину перекодированием. Без этого значения
    // единственным способом отказаться было бы удалить пакет.
    process.env.CAIRN_RECORDING_FFMPEG = 'off';

    expect(transcriberSettings().ffmpeg).toBe('off');
  });

  it('битрейт извлечения — настройка с умолчанием 24k', () => {
    // Компромисс точности и предела отправки, не измеренный на живом
    // материале; константа означала бы, что мы уже измерили.
    expect(transcriberSettings().audioBitrate).toBe('24k');
  });

  it('имя узла берётся из адреса, без пути и ключа', () => {
    process.env.CAIRN_TRANSCRIBER_BASE_URL = 'https://stt.api.cloud.yandex.net/stt/v3';

    expect(transcriberSettings().host).toBe('stt.api.cloud.yandex.net');
  });

  it('негодный адрес даёт пустое имя узла, а не аварию', () => {
    process.env.CAIRN_TRANSCRIBER_BASE_URL = 'не адрес';

    expect(transcriberSettings().host).toBeNull();
  });

  it('ноль в интервале опроса выключает цикл', () => {
    // Так работают тесты и локальная разработка — как у прогона
    // проверок статуса.
    process.env.CAIRN_TRANSCRIPTION_POLL_SECONDS = '0';

    expect(transcriberSettings().pollSeconds).toBe(0);
  });
});
```

`beforeEach`/`afterEach` чистят все тринадцать переменных — иначе тесты зависят от порядка.

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/settings.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать разбор**

Тринадцать переменных по таблице раздела 7.4 дизайна, константы имён переменных экспортируются (как в `suggester/settings.ts`), `hostOf` переиспользуется — он уже есть в `suggester/settings.ts` и ровно это делает. Второй копии не заводить: импортировать оттуда, добавив TSDoc о том, что функция общая для двух портов.

Внимание к `pollSeconds`: `0` — **законное** значение (цикл выключен), поэтому `positiveOf` для него не годится; нужен свой разбор «неотрицательное число либо умолчание».

Внимание к `ffmpeg`: эта настройка **не** разрешается в «доступно или нет» здесь. Функция отдаёт заявленное значение (`auto` / `off` / путь), а поиск исполняемого в `PATH` делает фабрика порта один раз при старте (Task 12a) — это вопрос к файловой системе, и задавать его при каждом вызове значило бы ходить на диск ради того, что за время жизни процесса не меняется.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription/settings.test.ts`
Expected: PASS, 15 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription/settings.ts apps/api/src/summaries/transcription/settings.test.ts
git commit -m "Завести разбор настроек службы расшифровки"
```

### Task 10: Сборка текста из потока ответов

**Files:**
- Create: `apps/api/src/summaries/transcription/transcript.ts`
- Create: `apps/api/src/summaries/transcription/transcript.test.ts`

Главная ловушка адаптера: ответ `getRecognition` — **не один JSON-объект, а поток объектов**, и они бывают склеены без перевода строки. `JSON.parse` всего тела на таком ответе падает.

- [ ] **Step 1: Написать падающий тест**

```ts
/** Событие с нормализованным текстом: в нём пунктуация. */
function refinement(text: string): string {
  return JSON.stringify({ final_refinement: { normalized_text: { alternatives: [{ text }] } } });
}

/** Событие с сырым текстом: без пунктуации, но лучше пустоты. */
function final(text: string): string {
  return JSON.stringify({ final: { alternatives: [{ text }] } });
}

describe('сборка текста расшифровки', () => {
  it('читает поток объектов, разделённых переводами строк', () => {
    const body = [refinement('Обсудили сроки.'), refinement('Решили перенести.')].join('\n');

    expect(transcriptOf(body)).toBe('Обсудили сроки. Решили перенести.');
  });

  it('читает поток объектов, склеенных без разделителя', () => {
    // Свидетельства о провайдере говорят, что так бывает. JSON.parse
    // всего тела здесь падает, а деление по \n не находит границ.
    const body = refinement('Раз.') + refinement('Два.');

    expect(transcriptOf(body)).toBe('Раз. Два.');
  });

  it('предпочитает нормализованный текст сырому', () => {
    const body = [final('раз два'), refinement('Раз, два.')].join('\n');

    expect(transcriptOf(body)).toBe('Раз, два.');
  });

  it('берёт сырой текст, когда нормализованного нет', () => {
    // Текст без пунктуации лучше пустоты: человек его правит.
    expect(transcriptOf(final('раз два'))).toBe('раз два');
  });

  it('пропускает служебные события', () => {
    const body = [
      JSON.stringify({ status_code: { code_type: 'WORKING' } }),
      JSON.stringify({ partial: { alternatives: [{ text: 'раз' }] } }),
      refinement('Раз, два.'),
    ].join('\n');

    // partial — промежуточная догадка, она обновляется и в текст не идёт.
    expect(transcriptOf(body)).toBe('Раз, два.');
  });

  it('обрезанный на середине объект не рушит разбор', () => {
    // Провайдер оборвал ответ: взять надо то, что доехало.
    const body = refinement('Раз.') + '{"final_refinement":{"normalized';

    expect(transcriptOf(body)).toBe('Раз.');
  });

  it('фигурная скобка внутри строки границей не считается', () => {
    expect(transcriptOf(refinement('Назвали ветку {main}.'))).toBe('Назвали ветку {main}.');
  });

  it('мусор вместо JSON даёт пустоту, а не исключение', () => {
    expect(transcriptOf('<html>502 Bad Gateway</html>')).toBe('');
  });

  it('пустой ответ даёт пустоту', () => {
    // Выше этой функции пустота превращается в transcription_empty:
    // создавать саммари из пустого текста нечем.
    expect(transcriptOf('')).toBe('');
  });

  it('нормализует собранный текст той же функцией, что вставленный', () => {
    // Иначе один и тот же созвон имел бы разную длину в зависимости от
    // того, как попал в систему.
    expect(transcriptOf(refinement('раз\r\nдва'))).toBe('раз\nдва');
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/transcript.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать функцию**

Чтение объектов по балансу фигурных скобок **вне строковых литералов** (со учётом экранирования), затем `JSON.parse` каждого куска по отдельности; негодный кусок пропускается, а не рушит разбор. Приоритет `final_refinement` над `final`, склейка по порядку, `normalizeSummaryText` из контракта на выходе.

TSDoc обязан сказать, что точный формат ответа провайдера **требует живой проверки** (пункт 4 таблицы проверок дизайна), и что функция написана снисходительной именно поэтому.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription/transcript.test.ts`
Expected: PASS, 10 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription/transcript.ts apps/api/src/summaries/transcription/transcript.test.ts
git commit -m "Собирать текст расшифровки из потока ответов службы"
```

### Task 11: Решение о незакрытой задаче

**Files:**
- Create: `apps/api/src/summaries/transcription/job-decision.ts`
- Create: `apps/api/src/summaries/transcription/job-decision.test.ts`

Чистая функция, идиома проекта (`incident-decision.ts`, `recheck-delay.ts`). Отвечает на главный вопрос фоновой задачи: что делать с тем, что увидел прогон после перезапуска API.

- [ ] **Step 1: Написать падающий тест**

```ts
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

  it.each([TranscriptionState.Done, TranscriptionState.Failed])('%s не трогается', (state) => {
    expect(decide({ ...JOB, state }).action).toBe(JobAction.Leave);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/job-decision.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать функцию**

Один вход — объект со состоянием задачи, видом адаптера, путями обоих файлов, временем приёма, `now`, остатком тяжёлых шагов в тике, пределом в минутах и `isEnabled`. Один выход — `{ action, code? }`. Ни обращений к базе, ни `Date.now()` внутри: время приходит параметром, иначе тест на предел пришлось бы писать подменой часов.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription/job-decision.test.ts`
Expected: PASS, 15 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription/job-decision.ts apps/api/src/summaries/transcription/job-decision.test.ts
git commit -m "Завести решение о судьбе незакрытой расшифровки"
```

### Task 11a: Решение «извлекать или отдавать как есть» *(новая задача)*

**Files:**
- Create: `apps/api/src/summaries/transcription/prepare-decision.ts`
- Create: `apps/api/src/summaries/transcription/prepare-decision.test.ts`

Задача появилась вместе с отменой решения «только аудио». Чистая функция, идиома проекта.

- [ ] **Step 1: Написать падающий тест**

```ts
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
    expect(
      prepare({ uploadType: 'audio/wav', uploadBytes: 10_000_000, canExtract: false }),
    ).toEqual({ action: PrepareAction.Pass });
  });

  it('без ffmpeg крупное аудио тоже отвергается названным кодом', () => {
    // Урезать его нечем, и отправить нельзя.
    expect(
      prepare({ uploadType: 'audio/mpeg', uploadBytes: 144_000_000, canExtract: false }),
    ).toEqual({ action: PrepareAction.Reject, code: RECORDING_NEEDS_FFMPEG });
  });

  it('ровно на пределе отправки — ещё Pass', () => {
    // Граница включительная: предел — это «не больше», а не «меньше».
    expect(
      prepare({ uploadType: 'audio/mpeg', uploadBytes: 41_943_040, maxSendBytes: 41_943_040 }),
    ).toEqual({ action: PrepareAction.Pass });
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/prepare-decision.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать функцию**

Три ветки по разделу 7.6 дизайна, в названном порядке: `Pass` первой (это не оптимизация, а правило), затем `Convert`, затем `Reject`. TSDoc обязан сказать, что шаг честнее называть **приведением к пригодному виду**, а не только извлечением: у него два повода сработать (чужой контейнер и чрезмерный размер) и одно действие.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription/prepare-decision.test.ts`
Expected: PASS, 9 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription/prepare-decision.ts apps/api/src/summaries/transcription/prepare-decision.test.ts
git commit -m "Решать, извлекать дорожку или отдавать запись как есть"
```

### Task 11b: Порт извлечения и классификация отказов `ffmpeg` *(новая задача)*

**Files:**
- Create: `apps/api/src/summaries/transcription/ffmpeg-failure.ts`
- Create: `apps/api/src/summaries/transcription/ffmpeg-failure.test.ts`
- Create: `apps/api/src/summaries/transcription/extractor.ts`
- Create: `apps/api/src/summaries/transcription/ffmpeg.extractor.ts`
- Create: `apps/api/src/summaries/transcription/ffmpeg.extractor.test.ts`
- Create: `apps/api/src/summaries/transcription/unavailable.extractor.ts`

**`ffmpeg` в тестах не запускается** (запрет 3): дочерний процесс подменяется, классификация проверяется чистой функцией над кодами выхода и заранее записанными строками `stderr`.

- [ ] **Step 1: Написать падающий тест**

Классификация:

```ts
describe('классификация отказа извлечения', () => {
  it('ffprobe упал — контейнер битый', () => {
    expect(failureOf({ stage: Stage.Probe, exitCode: 1 })).toBe(RECORDING_BROKEN);
  });

  it('ffprobe отработал, аудиопотока нет', () => {
    // Выгрузили только видео — и человеку надо выгрузить заново со
    // звуком, а не нажимать «снова».
    expect(failureOf({ stage: Stage.Probe, exitCode: 0, probe: { hasAudio: false } })).toBe(
      RECORDING_NO_AUDIO_TRACK,
    );
  });

  it('ffmpeg убит по пределу времени', () => {
    expect(failureOf({ stage: Stage.Convert, killed: true })).toBe(EXTRACTION_TIMED_OUT);
  });

  it.each([
    'Decoder (codec ac3) not found for codec id 86019',
    'Unsupported codec with id 86076 for input stream 1',
  ])('отказ декодера узнаётся по stderr: %s', (stderrTail) => {
    // Единственное место в дизайне, которое читает чужой текст.
    // Названная причина стоит одного хрупкого сравнения.
    expect(failureOf({ stage: Stage.Convert, exitCode: 1, stderrTail })).toBe(
      RECORDING_CODEC_UNSUPPORTED,
    );
  });

  it('незнакомый отказ ffmpeg деградирует в честное «не вышло»', () => {
    // Деградация тихая и в нужную сторону: человек получит правду,
    // только менее полезную. Обратная конструкция — угадывать «кодек»
    // по любому отказу — врала бы.
    expect(failureOf({ stage: Stage.Convert, exitCode: 1, stderrTail: 'что-то новое' })).toBe(
      EXTRACTION_FAILED,
    );
  });

  it('дорожка вышла, но больше предела отправки', () => {
    expect(failureOf({ stage: Stage.Convert, exitCode: 0, audioBytes: 44_000_000, maxSendBytes: 41_943_040 })).toBe(
      TRANSCRIPTION_TOO_LARGE,
    );
  });

  it('успех кодом отказа не называется', () => {
    expect(
      failureOf({ stage: Stage.Convert, exitCode: 0, audioBytes: 11_000_000, maxSendBytes: 41_943_040 }),
    ).toBeNull();
  });
});
```

Адаптер (с подменённым запуском процесса):

```ts
describe('адаптер ffmpeg', () => {
  it('зовёт ffprobe массивом аргументов, без оболочки', async () => {
    // Массив не запускает оболочку вовсе, значит имя файла не может
    // быть истолковано как команда.
    await extractor.probe('j.mp4', signal);

    expect(spawnMock.mock.calls[0]![1]).toEqual(expect.arrayContaining(['-select_streams', 'a:0']));
    expect(typeof spawnMock.mock.calls[0]![1]).not.toBe('string');
  });

  it('ставит -- перед путями', async () => {
    // Путь, начинающийся с дефиса, иначе был бы прочитан как ключ.
    await extractor.probe('j.mp4', signal);

    const args = spawnMock.mock.calls[0]![1] as string[];

    expect(args[args.length - 2]).toBe('--');
  });

  it('отбрасывает видео явно и сводит в моно 16 кГц', async () => {
    // -vn не оптимизация: мы заявили, что кадры не разбираем, и флаг —
    // то место, где заявление исполняется.
    await extractor.extract('j.mp4', JOB_ID, signal);

    const args = spawnMock.mock.calls[0]![1] as string[];

    expect(args).toEqual(expect.arrayContaining(['-vn', '-ac', '1', '-ar', '16000']));
  });

  it('кодирует в libopus с заданным битрейтом', async () => {
    // Не WAV: 16 кГц моно 16 бит — это 115 МБ на час, и часовой созвон
    // мимо предела тела запроса (дизайн, 3.6).
    const args = spawnMock.mock.calls[0]![1] as string[];

    expect(args).toEqual(expect.arrayContaining(['-c:a', 'libopus', '-b:a', '24k']));
  });

  it('запускается с -nostdin', async () => {
    // Без него ffmpeg на некоторых входах читает с терминала и висит
    // навсегда: предел убьёт его, но отказ будет без причины.
    expect(spawnMock.mock.calls[0]![1]).toContain('-nostdin');
  });

  it('stderr уходит в лог и не попадает в отказ', async () => {
    // В нём бывают пути, имена кодеков и обрывки содержимого.
    processStub.stderr.push('/var/lib/cairn/recordings/j.mp4: Invalid data');
    processStub.exit(1);

    await expect(extractor.extract('j.mp4', JOB_ID, signal)).rejects.not.toThrow(
      /var\/lib\/cairn/,
    );
  });

  it('предел времени убивает процесс', async () => {
    signalController.abort();

    await expect(extractor.extract('j.mp4', JOB_ID, signal)).rejects.toMatchObject({
      code: EXTRACTION_TIMED_OUT,
    });
    expect(processStub.killed).toBe(true);
  });

  it('недописанный выход убирается при отказе', async () => {
    // Остаток прошлой попытки иначе был бы принят за готовую дорожку:
    // ffmpeg писал в тот же путь.
    processStub.exit(1);

    await expect(extractor.extract('j.mp4', JOB_ID, signal)).rejects.toThrow();
    expect(store.removed).toContain(`${JOB_ID}.opus`);
  });
});

describe('извлечение недоступно', () => {
  it('отвечает недоступным и отказывает названным кодом', async () => {
    expect(unavailable.isAvailable).toBe(false);
    await expect(unavailable.extract('j.mp4', JOB_ID, signal)).rejects.toMatchObject({
      code: RECORDING_NEEDS_FFMPEG,
    });
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/ffmpeg-failure.test.ts src/summaries/transcription/ffmpeg.extractor.test.ts`
Expected: FAIL — модули не найдены

- [ ] **Step 3: Написать порт, адаптер и заглушку**

`extractor.ts` — интерфейс `AudioExtractor` по разделу 7.6 дизайна, токен `AUDIO_EXTRACTOR`, класс `ExtractionFailure` с полем `code` (по образцу `SuggesterFailure`, `cause` не несёт).

TSDoc интерфейса обязан назвать, **почему порт отдельный от `Transcriber`**: извлечение не уходит наружу, не стоит денег, не имеет узла и настраивается своими переменными; слепить их значило бы дать выключенной расшифровке выключить и извлечение, а установка с `ffmpeg` и без ключа вполне осмысленна.

`ffmpeg.extractor.ts` — `probe` и `extract` через `spawn` с массивом аргументов, шесть решений вызова из раздела 7.6 (массив, `--`, `-nostdin`, `-vn`, `-ac 1 -ar 16000`, `stderr` только в лог). Запуск процесса — через **внедряемую** функцию, чтобы тест подменял её, а не `child_process` целиком.

`unavailable.extractor.ts` — `isAvailable: false`, оба метода бросают `ExtractionFailure(RECORDING_NEEDS_FFMPEG)`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription`
Expected: PASS, 17 новых тестов; ни один не запускал `ffmpeg`

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription
git commit -m "Завести порт извлечения дорожки и адаптер на ffmpeg"
```

### Task 12: Порт расшифровки и две реализации

**Files:**
- Create: `apps/api/src/summaries/transcription/transcriber.ts`
- Create: `apps/api/src/summaries/transcription/disabled.transcriber.ts`
- Create: `apps/api/src/summaries/transcription/yandex-speechkit.transcriber.ts`
- Create: `apps/api/src/summaries/transcription/yandex-speechkit.transcriber.test.ts`
- Modify: `apps/api/src/summaries/summaries.module.ts`

Адаптер проверяется подменённым `fetch`. **Ни один тест не ходит в сеть.**

- [ ] **Step 1: Написать падающий тест**

```ts
describe('адаптер Yandex SpeechKit', () => {
  it('отправляет дорожку в теле запроса, а не ссылкой на бакет', async () => {
    // Главная находка проверки документации: v3 принимает content
    // байтами до 60 МБ, и бакет не нужен — значит у записи не появляется
    // второй долговременной копии вне нашей машины (дизайн, 3.1).
    await transcriber.start({ audioPath: 'запись.opus', audioType: 'audio/ogg' }, signal);

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);

    expect(body.content).toBe(Buffer.from(BYTES).toString('base64'));
    expect(body.uri).toBeUndefined();
  });

  it('называет контейнер по типу дорожки', async () => {
    // После появления извлечения обычным случаем стал OGG_OPUS, а WAV и
    // MP3 приходят только с файлов, прошедших мимо извлечения.
    await transcriber.start({ audioPath: 'з.opus', audioType: 'audio/ogg' }, signal);

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);

    expect(body.recognition_model.audio_format.container_audio.container_audio_type).toBe(
      'OGG_OPUS',
    );
  });

  it('загруженного файла порт расшифровки не видит вовсе', async () => {
    // Он работает только с тем, что уже пригодно службе: видеофайл ему
    // нечем даже назвать.
    expect(Object.keys(INPUT)).toEqual(['audioPath', 'audioType']);
  });

  it('не отправляет наружу ничего, кроме дорожки и опций модели', async () => {
    // Тело сравнивается целиком, как в первой итерации сравнивается
    // тело запроса к предложителю: ни одного кадра видео, ни имени
    // проекта, ни окружений, ни адресов, ни переменных, ни имени
    // субъекта.
    await transcriber.start({ audioPath: 'з.opus', audioType: 'audio/ogg' }, signal);

    expect(Object.keys(JSON.parse(fetchMock.mock.calls[0]![1].body))).toEqual([
      'content',
      'recognition_model',
    ]);
  });

  it('не отправляет заголовок логирования данных никогда', async () => {
    // Аудио у провайдера по умолчанию не сохраняется; логирование
    // включается этим заголовком, и он не наш.
    await transcriber.start({ audioPath: 'з.opus', audioType: 'audio/ogg' }, signal);

    const headers = fetchMock.mock.calls[0]![1].headers;

    expect(headers['x-data-logging-enabled']).toBeUndefined();
    expect(Object.keys(headers).sort()).toEqual([
      'Authorization',
      'Content-Type',
      'x-folder-id',
    ]);
  });

  it('отдаёт running и идентификатор операции', async () => {
    fetchMock.mockResolvedValue(json({ id: 'операция-1' }));

    const answer = await transcriber.start(INPUT, signal);

    expect(answer).toEqual({
      state: TranscriptionState.Running,
      externalId: 'операция-1',
      text: null,
      code: null,
    });
  });

  it('ответ без идентификатора — отказ, а не running без ключа опроса', async () => {
    fetchMock.mockResolvedValue(json({}));

    await expect(transcriber.start(INPUT, signal)).rejects.toThrow(TranscriberFailure);
  });

  it('опрос незакончённой операции отдаёт running', async () => {
    fetchMock.mockResolvedValue(json({ done: false }));

    expect((await transcriber.poll('операция-1', signal)).state).toBe(TranscriptionState.Running);
  });

  it('операция с ошибкой отдаёт failed без чужого тела наружу', async () => {
    // В теле чужого ответа бывает и присланное нами, и подробности о
    // ключе: наружу идёт только код.
    fetchMock.mockResolvedValue(json({ done: true, error: { message: 'ключ ... ' } }));

    const answer = await transcriber.poll('операция-1', signal);

    expect(answer).toEqual({
      state: TranscriptionState.Failed,
      code: TRANSCRIBER_UNAVAILABLE,
      text: null,
      externalId: 'операция-1',
    });
  });

  it('законченная операция забирает текст вторым запросом', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ done: true }))
      .mockResolvedValueOnce(text(refinement('Обсудили сроки.')));

    const answer = await transcriber.poll('операция-1', signal);

    expect(answer.state).toBe(TranscriptionState.Done);
    expect(answer.text).toBe('Обсудили сроки.');
  });

  it('законченная операция без текста — названная неудача', async () => {
    // Тишина в записи успехом быть не может: саммари рождается из
    // текста, а пустого content у записи хроники не бывает.
    fetchMock.mockResolvedValueOnce(json({ done: true })).mockResolvedValueOnce(text(''));

    expect((await transcriber.poll('операция-1', signal)).code).toBe(TRANSCRIPTION_EMPTY);
  });

  it('таймаут и 5xx дают отказ с кодом, а не исключение провайдера', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT /stt/v3?key=...'));

    await expect(transcriber.start(INPUT, signal)).rejects.toMatchObject({
      code: TRANSCRIBER_UNAVAILABLE,
    });
  });

  it('повторов не делает', async () => {
    // Один вызов — одна плата; повтор это нажатие человека.
    fetchMock.mockRejectedValue(new Error('сеть'));

    await expect(transcriber.start(INPUT, signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('просит службу забыть результаты после укладки текста', async () => {
    // Результаты живут у провайдера 3 суток: убираем сразу, не
    // дожидаясь срока.
    await transcriber.forget('операция-1');

    expect(fetchMock.mock.calls[0]![0]).toContain('deleteRecognition');
  });

  it('отказ forget не бросает: он best effort', async () => {
    // Текст уже у нас; повторять расшифровку из-за неубранных
    // результатов незачем, а через три суток они истекут сами.
    fetchMock.mockRejectedValue(new Error('404'));

    await expect(transcriber.forget('операция-1')).resolves.toBeUndefined();
  });
});

describe('выключенный порт', () => {
  it('отвечает выключенным и отказывает названным кодом', async () => {
    expect(disabled.isEnabled).toBe(false);
    await expect(disabled.start(INPUT, signal)).rejects.toMatchObject({
      code: TRANSCRIBER_DISABLED,
    });
  });

  it('узла не называет: врать подписью над кнопкой нельзя', () => {
    expect(disabled.host).toBeNull();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/yandex-speechkit.transcriber.test.ts`
Expected: FAIL — модули не найдены

- [ ] **Step 3: Написать порт, адаптер и заглушку**

`transcriber.ts` — интерфейс `Transcriber`, типы `TranscriptionInput` (с полями `audioPath`/`audioType`) и `TranscriptionAnswer`, токен `TRANSCRIBER`, класс `TranscriberFailure` (по образцу `SuggesterFailure`: поле `code`, `cause` не несёт намеренно). TSDoc обязан назвать **четыре отличия от раздела 6.1 первой итерации** и причину каждого — иначе следующий читатель сверит с прежним дизайном и решит, что порт разошёлся случайно. Плюс пятое, из правки этого дизайна: порт видит **дорожку**, а загруженный файл ему не показывается.

`yandex-speechkit.transcriber.ts` — три ручки по разделу 7.2 дизайна. Опции `text_normalization`, `language_restriction` и `audio_processing_type` **не отправляются**, и рядом стоит комментарий, что их написание не проверено живым вызовом (пункт 3 таблицы проверок) — а не догадка в коде.

`disabled.transcriber.ts` — `isEnabled: false`, `host: null`, все три метода бросают `TranscriberFailure(TRANSCRIBER_DISABLED)`.

**Две фабрики** в `summaries.module.ts`, по образцу `TASK_SUGGESTER`:

- `TRANSCRIBER` — `useFactory` читает настройки и отдаёт `YandexSpeechKitTranscriber` либо `DisabledTranscriber`. Место под `local` — ветка с комментарием и `DisabledTranscriber` до появления адаптера: обещать `local`, которого нет, хуже, чем честно выключить;
- `AUDIO_EXTRACTOR` — `useFactory` **один раз** проверяет, есть ли исполняемый файл (`CAIRN_RECORDING_FFMPEG`: `off` → сразу `UnavailableExtractor`; `auto` → поиск в `PATH`; путь → проверка его), и отдаёт `FfmpegExtractor` либо `UnavailableExtractor`. Результат уходит в безопасное сообщение при старте («извлечение доступно» либо «извлечение недоступно: принимаются только MP3, WAV и OGG») — ровно так же, как вид и модель предложителя.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription`
Expected: PASS, 17 тестов порта расшифровки плюс всё из Task 11a и 11b

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription apps/api/src/summaries/summaries.module.ts
git commit -m "Завести порт расшифровки и адаптер Yandex SpeechKit"
```

**Проверка глазами после чанка 3:** оба порта обязаны быть выключаемы независимо. `grep -n "AUDIO_EXTRACTOR\|TRANSCRIBER" apps/api/src/summaries/summaries.module.ts` — две фабрики, и ни одна не читает настройку другой. Установка с `ffmpeg` и без ключа должна принимать видео, извлекать дорожку и честно говорить, что отправлять её некуда.

---

## Чанк 4: Прогон и ручки

### Task 13: Служба расшифровки: приём записи и рождение саммари

**Files:**
- Create: `apps/api/src/summaries/transcription/transcription.service.ts`
- Create: `apps/api/src/summaries/transcription/transcription.service.test.ts`
- Modify: `apps/api/src/audit/audit.types.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('приём записи', () => {
  it('кладёт файл на том и заводит задачу одной транзакцией', async () => {
    const job = await service.accept(writer, projectId, PASSPORT, stream());

    expect(job.state).toBe(TranscriptionState.Queued);
    expect(store.saved).toHaveLength(1);
  });

  it('пишет в журнал приём записи, без имени файла', async () => {
    await service.accept(writer, projectId, PASSPORT, stream());

    expect(audit.entries).toEqual([
      expect.objectContaining({
        action: AuditAction.SummaryRecordingUploaded,
        metadata: expect.objectContaining({ uploadBytes: SIZE, uploadType: 'video/mp4' }),
      }),
    ]);
    expect(JSON.stringify(audit.entries)).not.toContain('Клиент');
  });

  it('отвергает запись, чья подпись не совпала с объявленным типом', async () => {
    await expect(
      service.accept(writer, projectId, PASSPORT, pdfStream()),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: RECORDING_NOT_AUDIO }) });
  });

  it('при выключенном порте запись не принимается', async () => {
    // Иначе файл лёг бы на том и остался там навсегда: расшифровать его
    // нечем, а человек о нём забудет.
    await expect(service.accept(writer, projectId, PASSPORT, stream())).rejects.toMatchObject({
      response: expect.objectContaining({ code: TRANSCRIBER_DISABLED }),
    });
  });

  it('без ffmpeg видео не принимается названным кодом', async () => {
    // Решение принимает prepareDecision, и приём отвергает **до**
    // записи двух гигабайт на том.
    extractor.isAvailable = false;

    await expect(service.accept(writer, projectId, PASSPORT, stream())).rejects.toMatchObject({
      response: expect.objectContaining({ code: RECORDING_NEEDS_FFMPEG }),
    });
    expect(store.saved).toHaveLength(0);
  });

  it('без ffmpeg уже-пригодное аудио принимается', async () => {
    // Установка без ffmpeg остаётся рабочей, только уже.
    extractor.isAvailable = false;

    await expect(
      service.accept(writer, projectId, { ...PASSPORT, uploadType: 'audio/mpeg' }, mp3Stream()),
    ).resolves.toBeDefined();
  });

  it('запись больше предела загрузки не принимается и на том не ложится', async () => {
    await expect(service.accept(writer, projectId, PASSPORT, hugeStream())).rejects.toMatchObject({
      response: expect.objectContaining({ code: RECORDING_TOO_LARGE, maxBytes: 2_147_483_648 }),
    });
    expect(store.saved).toHaveLength(0);
  });

  it('отказ после укладки файла файл убирает', async () => {
    // Иначе неудачный приём оставлял бы сироту при каждой ошибке.
    repository.failOnCreate = true;

    await expect(service.accept(writer, projectId, PASSPORT, stream())).rejects.toThrow();
    expect(store.saved).toHaveLength(0);
  });

  it('пригодное аудио не идёт на извлечение: дорожка равна загруженному', async () => {
    const job = await service.accept(
      writer,
      projectId,
      { ...PASSPORT, uploadType: 'audio/mpeg' },
      mp3Stream(),
    );

    expect(job.audioBytes).toBe(job.uploadBytes);
    expect(job.audioType).toBe('audio/mpeg');
  });
});

describe('рождение саммари из расшифровки', () => {
  it('создаёт запись хроники и саммари одной транзакцией', async () => {
    await service.settle(job, 'Обсудили сроки.');

    const [entry] = await testDb.rowsOf(chronicleEntries);

    expect(entry?.source).toBe(ChronicleSource.Summary);
    expect(entry?.content).toBe('Обсудили сроки.');
    expect(await testDb.rowsOf(summaries)).toHaveLength(1);
  });

  it('паспорт берётся из задачи, а не придумывается', async () => {
    await service.settle(job, 'Текст.');

    const [entry] = await testDb.rowsOf(chronicleEntries);

    expect(entry?.title).toBe('Созвон по релизу');
    expect(entry?.occurredOn).toBe('2026-11-17');
  });

  it('done ставится той же транзакцией, что текст', async () => {
    // Обратный порядок при падении между шагами дал бы законченную
    // расшифровку без текста — работу, за которую заплатили и которую
    // потеряли.
    repository.failOnMarkDone = true;

    await expect(service.settle(job, 'Текст.')).rejects.toThrow();
    expect(await testDb.rowsOf(chronicleEntries)).toHaveLength(0);
  });

  it('работает правом того, кто попросил', async () => {
    // Системного действующего лица здесь нет: второй путь записи «от
    // системы, без проверки» был бы дыркой в модели прав.
    expect(audit.entries.at(-1)?.actor.id).toBe(writer.id);
  });

  it('выдачу отозвали, пока расшифровывалось — текст не ляжет', async () => {
    await revokeGrant(writer.id, projectId, Section.Chronicle);

    await service.settle(job, 'Текст.');

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.state).toBe(TranscriptionState.Failed);
    expect(row?.failureCode).toBe('transcription_no_access');
  });

  it('при потере доступа оба файла убираются, а строка остаётся', async () => {
    // Иначе на томе лежало бы до двух гигабайт, видимых никому: задачу
    // не видит ни тот, кто её создал, ни кто-либо другой.
    await revokeGrant(writer.id, projectId, Section.Chronicle);

    await service.settle(job, 'Текст.');

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.uploadPath).toBeNull();
    expect(row?.audioPath).toBeNull();
    expect(row?.uploadBytes).toBeGreaterThan(0);
  });

  it('повторная расшифровка правит существующую запись, а не плодит вторую', async () => {
    await service.settle(repeatJob, 'Новый текст.');

    expect(await testDb.rowsOf(summaries)).toHaveLength(1);
    expect((await testDb.rowsOf(chronicleEntries))[0]?.content).toBe('Новый текст.');
  });

  it('повторная расшифровка метит задачи возможно устаревшими', async () => {
    // Бесплатно: правка записи двигает updated_at, а isTextStale первой
    // итерации считается по нему.
    await service.settle(repeatJob, 'Новый текст.');

    const detail = await summaries.findById(writer, projectId, summaryId);

    expect(detail.isTextStale).toBe(true);
  });

  it('повторная расшифровка пишет в журнал число знаков', async () => {
    await service.settle(repeatJob, 'Новый текст.');

    expect(audit.entries.at(-1)).toMatchObject({
      action: AuditAction.SummaryTranscribed,
      metadata: expect.objectContaining({ chars: 12 }),
    });
  });

  it('первый успех тоже пишет summary.transcribed', async () => {
    // Правка от решения об уборке исходника: прежде первый успех
    // записи не получал (её заменяла пара chronicle_entry.created +
    // summary.created), но теперь он уничтожает загруженный человеком
    // файл, а удаление данных обязано быть в неизменяемом журнале.
    await service.settle(job, 'Обсудили сроки.');

    expect(audit.entries.map((entry) => entry.action)).toContain(
      AuditAction.SummaryTranscribed,
    );
    expect(audit.entries.at(-1)?.metadata).toMatchObject({
      sourceRemoved: true,
      uploadBytes: 566_231_040,
      uploadType: 'video/mp4',
    });
  });

  it('убирает исходник после фиксации транзакции, не внутри', async () => {
    // Обратный порядок при откате оставил бы саммари без исходника и
    // без текста; unlink внутри транзакции не откатывается вовсе.
    await service.settle(job, 'Текст.');

    expect(store.removedAfterCommit).toBe(true);
    expect(store.removed).toEqual([`${job.id}.mp4`]);
  });

  it('дорожку не трогает', async () => {
    // Запись, которая хранится, пока живёт саммари, — это дорожка.
    await service.settle(job, 'Текст.');

    expect(store.removed).not.toContain(`${job.id}.opus`);
  });

  it('не убирает единственный файл у саммари из mp3', async () => {
    await service.settle(passThroughJob, 'Текст.');

    expect(store.removed).toEqual([]);
  });

  it('сбой уборки исходника не валит укладку текста', async () => {
    // Текст уже в базе; откатывать его из-за осиротевшего файла
    // значило бы потерять работу, за которую заплатили. Сирота виден
    // предупреждением в логе.
    store.failOnRemove = true;

    await expect(service.settle(job, 'Текст.')).resolves.toBeUndefined();
    expect((await testDb.rowsOf(chronicleEntries))[0]?.content).toBe('Текст.');
  });

  it('при неудаче исходник остаётся', async () => {
    // Главный довод решения: повторить попытку всегда есть из чего.
    await service.fail(job, TRANSCRIBER_UNAVAILABLE);

    expect(store.removed).toEqual([]);

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.uploadPath).not.toBeNull();
  });

  it('повторная расшифровка после уборки исходника работает', async () => {
    // Дорожка есть, исходника нет — это обычное состояние саммари, и
    // «Расшифровать снова» обязано работать (дизайн, 3.3 следствие 2).
    await service.settle(job, 'Текст.');

    await expect(service.retry(writer, projectId, summaryId)).resolves.toBeDefined();
  });

  it('текста расшифровки в журнале нет', async () => {
    await service.settle(job, 'Секретное обсуждение увольнения.');

    expect(JSON.stringify(audit.entries)).not.toContain('увольнения');
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/transcription.service.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать службу и пять действий журнала**

В `audit.types.ts` — пять новых значений рядом с действиями саммари:

```ts
SummaryRecordingUploaded = 'summary.recording_uploaded',
SummaryTranscriptionRequested = 'summary.transcription_requested',
SummaryTranscriptionFailed = 'summary.transcription_failed',
SummaryTranscribed = 'summary.transcribed',
SummaryTranscriptionDeleted = 'summary.transcription_deleted',
```

Служба: `accept` (проверки → `prepareDecision` → приём потоком → задача и журнал одной транзакцией, с уборкой файла при отказе), `settle` (текст → запись хроники и саммари или правка записи → `markDone` → журнал, всё одной транзакцией; **`unlink` исходника — после её фиксации**), `fail`, `cancel`, `remove`, `retry`.

Порядок в `settle` обязателен и назван: текст, `done` и `summary.transcribed` идут **одной** транзакцией, а путь исходника, который вернул `markDone`, уносится `store.remove` уже после `commit`, в `try/catch` с предупреждением в лог. Сбой уборки не откатывает текст: он уже получен и оплачен, а осиротевший файл — это лишний диск, не потерянные данные.

`fail`, `cancel` и путь отказа извлечения `upload_path` **не трогают вовсе** — на этом держится правило «исходник переживает любую неудачу», и в коде рядом с каждым из них стоит короткий комментарий об этом. Единственное исключение — потеря доступа (дизайн, 6.5): там убираются оба файла, и там же сказано, почему это не противоречие (повторять некому).

Порядок проверок в `accept` обязателен и такой: порт выключен → `prepareDecision` по **объявленному** типу и ожидаемому размеру → только потом приём байтов. Иначе два гигабайта дотекли бы на том, чтобы получить отказ, который был известен заранее. Размер на входе ещё неизвестен, поэтому `prepareDecision` на этом шаге отвечает только на вопрос «умеет ли установка такой контейнер вообще»; второй раз та же функция зовётся **после** приёма, когда размер известен, и решает «извлекать или отдать как есть». Два вызова одной функции на разных входах — не дубль: первый отсекает заведомо негодное, второй выбирает путь.

Рождение саммари идёт **через существующие** `ChronicleRepository` и `SummariesRepository` — своей вставки в `summaries` нет, как в первой итерации не было своей вставки в `roadmap_versions`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription/transcription.service.test.ts`
Expected: PASS, 28 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription apps/api/src/audit/audit.types.ts
git commit -m "Рождать саммари из готовой расшифровки одной транзакцией"
```

### Task 14: Фоновый прогон

**Files:**
- Create: `apps/api/src/summaries/transcription/transcription-runner.service.ts`
- Create: `apps/api/src/summaries/transcription/transcription-runner.service.test.ts`
- Create: `apps/api/src/summaries/transcription/transcription-start.test.ts`
- Modify: `apps/api/src/summaries/summaries.module.ts`

Образец — `status-runner.service.ts` целиком, вплоть до отдельного соединения под замок и синхронного захвата признака. Тест на подъём — по образцу `status-start.test.ts`.

- [ ] **Step 1: Написать падающий тест**

```ts
describe('прогон расшифровок', () => {
  it('пишет в журнал передачу до первого байта', async () => {
    // Нет записи — нет и передачи. В записи созвона есть всё
    // сказанное, включая то, чего в саммари нет.
    transcriber.onStart = () => {
      expect(audit.entries.at(-1)?.action).toBe(AuditAction.SummaryTranscriptionRequested);
    };

    await runner.runAll();

    expect(transcriber.started).toBe(1);
  });

  it('в записи журнала о передаче есть узел и нет ключа', async () => {
    await runner.runAll();

    const entry = audit.entries.find(
      (candidate) => candidate.action === AuditAction.SummaryTranscriptionRequested,
    );

    expect(entry?.metadata).toMatchObject({ host: 'stt.api.cloud.yandex.net', dataLogging: false });
    expect(JSON.stringify(entry)).not.toContain('секретный-ключ');
  });

  it('в записи журнала о передаче назван размер дорожки, а не файла', async () => {
    // Наружу уходит дорожка; метаданные несут и то и другое, но на
    // вопрос «что покинуло машину» отвечает только audioBytes.
    await runner.runAll();

    const entry = audit.entries.find(
      (c) => c.action === AuditAction.SummaryTranscriptionRequested,
    );

    expect(entry?.metadata).toMatchObject({
      audioBytes: 11_534_336,
      audioType: 'audio/ogg',
      uploadBytes: 566_231_040,
      extracted: true,
    });
  });

  it('делает не больше одного тяжёлого шага за тик', async () => {
    // Константа, а не настройка: число описывает ядро и память машины,
    // а не вкус установки, и переменная приглашала бы поставить десять.
    await seedQueued(3);

    await runner.runAll();

    expect(transcriber.started + extractor.extracted).toBe(1);
  });

  it('извлечение и отправка делят один и тот же бюджет', async () => {
    // Это один ресурс, и бюджет, считающий его по частям, не бюджет.
    // Следствие: одна запись покидает машину за два тика.
    await seedQueued(1, { audioPath: null });

    await runner.runAll();
    expect(extractor.extracted).toBe(1);
    expect(transcriber.started).toBe(0);

    await runner.runAll();
    expect(transcriber.started).toBe(1);
  });

  it('опрашивает все идущие за один тик', async () => {
    // Опрос тела не несёт и наружу ничего не раскрывает сверх уже
    // отправленного.
    await seedRunning(5);

    await runner.runAll();

    expect(transcriber.polled).toBe(5);
  });

  it('опрос идёт прежде извлечения', async () => {
    // Порядок имеет цену: опрашивай после ffmpeg, и готовый у
    // провайдера текст лежал бы ещё столько, сколько длится чужое
    // перекодирование. Одна строка порядка — и расшифровки не ждут.
    await seedRunning(1);
    await seedQueued(1, { audioPath: null });

    await runner.runAll();

    expect(order).toEqual(['poll', 'extract']);
  });

  it('извлечение ставит extracting прежде запуска ffmpeg', async () => {
    // Захват работы: без него два тика двух экземпляров API запустили
    // бы два ffmpeg на один файл.
    extractor.onExtract = async () => {
      const [row] = await testDb.rowsOf(transcriptionJobs);

      expect(row?.state).toBe(TranscriptionState.Extracting);
    };

    await runner.runAll();
  });

  it('готовая дорожка возвращает задачу в очередь, а не отправляет сразу', async () => {
    await seedQueued(1, { audioPath: null });

    await runner.runAll();

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.state).toBe(TranscriptionState.Queued);
    expect(row?.audioBytes).toBeGreaterThan(0);
  });

  it('отказ извлечения закрывает задачу названным кодом', async () => {
    extractor.failWith = RECORDING_NO_AUDIO_TRACK;

    await runner.runAll();

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.state).toBe(TranscriptionState.Failed);
    expect(row?.failureCode).toBe(RECORDING_NO_AUDIO_TRACK);
  });

  it('отказ извлечения оставляет загруженный файл', async () => {
    // Отказ не повод терять то, что человек загрузил по медленному
    // каналу: повторная попытка должна быть из чего делать.
    extractor.failWith = EXTRACTION_FAILED;

    await runner.runAll();

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.uploadPath).not.toBeNull();
  });

  it.each([
    ['отказ службы', () => (transcriber.startFails = true)],
    ['отказ извлечения', () => (extractor.failWith = EXTRACTION_FAILED)],
    ['пустая расшифровка', () => (transcriber.emptyText = true)],
    ['таймаут', () => (clock.advanceMinutes(121))],
  ])('%s загруженный файл не уносит', async (_name, arrange) => {
    // Сторож главного довода решения об уборке исходника: он убирается
    // ровно на done и ни при чём другом (дизайн, 2.6 и 7.5).
    arrange();

    await runner.runAll();

    expect(store.removed).toEqual([]);
  });

  it('укладка текста уносит исходник, но не дорожку', async () => {
    await runner.runAll();

    expect(store.removed).toEqual([`${JOB_ID}.mp4`]);
    expect(store.removed).not.toContain(`${JOB_ID}.opus`);
  });

  it('извлечение в журнал отдельной записью не пишется', async () => {
    // Наружу ничего не уходит, в проекте ничего не появляется, а исход
    // виден в строке задачи. Факт извлечения есть в журнале признаком
    // extracted у записи о передаче — там, где он что-то значит.
    await runner.runAll();

    expect(audit.entries.map((entry) => entry.action)).not.toContain('summary.recording_extracted');
  });

  it('сбой опроса исходом не считается', async () => {
    // Таймаут у GET /operations ничего не говорит о судьбе работы:
    // провайдер считает дальше.
    transcriber.pollFails = true;

    await runner.runAll();

    expect((await testDb.rowsOf(transcriptionJobs))[0]?.state).toBe(TranscriptionState.Running);
  });

  it('отказ отправки закрывает задачу и пишет неудачу', async () => {
    transcriber.startFails = true;

    await runner.runAll();

    const [row] = await testDb.rowsOf(transcriptionJobs);

    expect(row?.state).toBe(TranscriptionState.Failed);
    expect(audit.entries.at(-1)?.action).toBe(AuditAction.SummaryTranscriptionFailed);
  });

  it('в записи неудачи нет тела чужого ответа', async () => {
    transcriber.startFails = true;

    await runner.runAll();

    expect(JSON.stringify(audit.entries)).not.toContain('Bad Gateway');
  });

  it('падение одной задачи не прерывает тик', async () => {
    // Как обход адресов не прерывается падением одного адреса.
    await seedRunning(2);
    transcriber.failOn = 0;

    await runner.runAll();

    expect(transcriber.polled).toBe(2);
  });

  it('второй тик при идущем первом не начинается', async () => {
    void runner.runAll();

    expect(await runner.runAll()).toBe(TranscriptionRunOutcome.Busy);
  });

  it('занятый замок базы даёт Busy, а не ожидание', async () => {
    // В памяти замок не защитил бы от второго экземпляра API за прокси,
    // а два тика сразу — это две отправки одной записи наружу.
    await holdLockOnAnotherConnection();

    expect(await runner.runAll()).toBe(TranscriptionRunOutcome.Busy);
  });

  it('просит службу забыть результаты после укладки текста', async () => {
    await runner.runAll();

    expect(transcriber.forgotten).toEqual(['операция-1']);
  });

  it('отказ forget исхода не меняет', async () => {
    transcriber.forgetFails = true;

    await runner.runAll();

    expect((await testDb.rowsOf(transcriptionJobs))[0]?.state).toBe(TranscriptionState.Done);
  });
});

describe('подъём приложения', () => {
  it('прерванная отправка закрывается неудачей, а не повторяется', async () => {
    // Исход неизвестен: отправить ещё раз значит передать созвон второй
    // раз и заплатить второй раз.
    await seedSending();

    await runner.runAll();

    expect((await testDb.rowsOf(transcriptionJobs))[0]?.failureCode).toBe(
      TRANSCRIPTION_INTERRUPTED,
    );
    expect(transcriber.started).toBe(0);
  });

  it('идущая расшифровка переживает перезапуск', async () => {
    // Это и есть причина держать состояние в базе: провайдер работает
    // независимо от нашего процесса.
    await seedRunning(1);

    await runner.runAll();

    expect(transcriber.polled).toBe(1);
  });

  it('прерванное извлечение повторяется, а не признаётся неудачей', async () => {
    // Передача наружу не повторяется (вторая плата и второе
    // раскрытие), а извлечение — повторяется: оно бесплатно и ничего
    // не раскрывает.
    await seedExtracting();

    await runner.runAll();

    expect(extractor.extracted).toBe(1);
  });

  it('повтор извлечения убирает недописанный выход до запуска', async () => {
    // ffmpeg писал в тот же путь, и остаток прошлой попытки иначе был
    // бы принят за готовую дорожку.
    await seedExtracting();
    await writeStaleOutput();

    await runner.runAll();

    expect(store.removedBeforeExtract).toContain(`${JOB_ID}.opus`);
  });

  it('остановка убивает ffmpeg и не ждёт его', async () => {
    // Тик, занятый ffmpeg, длится минуты, и держать остановку
    // приложения столько нельзя. Строка останется в extracting, и
    // следующий подъём начнёт извлечение заново.
    void runner.runAll();

    await runner.onModuleDestroy();

    expect(extractor.aborted).toBe(true);
  });

  it('нулевой интервал цикл не запускает', async () => {
    // Так работают тесты и локальная разработка.
    process.env.CAIRN_TRANSCRIPTION_POLL_SECONDS = '0';

    runner.onModuleInit();

    expect(runner.hasTimer).toBe(false);
  });

  it('первый тик идёт сразу, а не через интервал', async () => {
    // Иначе загруженная запись стояла бы в очереди лишние двадцать
    // секунд после каждого деплоя — то же решение, что у прогона
    // проверок.
    runner.onModuleInit();

    expect(runner.ticks).toBe(1);
  });

  it('остановка ждёт конца идущей отправки', async () => {
    // Иначе остался бы sending там, где через полсекунды был бы
    // running, — и следующий подъём закрыл бы живую расшифровку.
    void runner.runAll();

    await runner.onModuleDestroy();

    expect(runner.isIdle).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/transcription-runner.service.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать прогон**

Устройство — по разделу 6 дизайна. Обязательно повторить четыре приёма `StatusRunnerService`, и TSDoc обязан сказать, что это повторение, а не совпадение:

1. замок `pg_try_advisory_xact_lock(0x4341_4952, 2)` — тот же класс, объект 2;
2. **отдельное соединение** под замок (`TRANSCRIPTION_RUN_LOCK_DB`), потому что в тестах рабочий пул — одно соединение;
3. замок **уровня транзакции**, а не сеансовый;
4. синхронный захват признака до первого `await`.

`MAX_HEAVY_PER_TICK = 1` — константа с TSDoc, объясняющим обе половины решения: почему один (ядро и память машины) и почему общий на извлечение и отправку (это один и тот же ресурс, и бюджет, считающий его по частям, не бюджет).

Порядок внутри тика — **опрос, потом один тяжёлый шаг**, и TSDoc обязан назвать цену обратного порядка: готовый у провайдера текст ждал бы столько, сколько длится чужое перекодирование.

И два отличия от прогона проверок, которые надо назвать прямо, иначе их прочтут как небрежность:

- `onModuleDestroy` **не ждёт** `ffmpeg`, а убивает его: тик с извлечением длится минуты, и держать остановку приложения столько нельзя. Терять нечего — извлечение бесплатно и ничего не раскрывает, а следующий подъём начнёт заново;
- замок держится всё извлечение, то есть **минуты**, а не секунды. Цена названа в разделе 6.2 дизайна (долгая транзакция держит `xmin` и мешает уборке мёртвых строк), и альтернатива — замок только на захват задачи — там же отвергнута с причиной.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries/transcription`
Expected: PASS, 28 новых тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries/transcription apps/api/src/summaries/summaries.module.ts
git commit -m "Завести фоновый прогон расшифровок под замком в базе"
```

### Task 15: Ручки и приём сырого тела

**Files:**
- Create: `apps/api/src/summaries/transcription/transcriptions.controller.ts`
- Create: `apps/api/src/summaries/transcription/transcriptions.controller.test.ts`
- Modify: `apps/api/src/summaries/summaries-overview.controller.ts`
- Modify: `apps/api/src/summaries/summaries-overview.controller.test.ts`
- Modify: `apps/api/src/summaries/summaries.repository.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
describe('ручки расшифровки', () => {
  it('принимает запись сырым телом и паспортом в строке запроса', async () => {
    const response = await request(app)
      .post(`/api/projects/${projectId}/summaries/transcriptions`)
      .query({ occurredOn: '2026-11-17', title: 'Созвон', uploadType: 'video/mp4' })
      .set('Content-Type', 'video/mp4')
      .send(Buffer.from(MP4_BYTES));

    expect(response.status).toBe(202);
  });

  it('202, а не 201: создана задача, результат будет позже', async () => {
    expect(await accept()).toHaveProperty('status', 202);
  });

  it('тело не проходит через разборщик и достаётся контроллеру потоком', async () => {
    // express.json и urlencoded стоят на своих типах содержимого и
    // video/mp4 не касаются; поэтому main.ts не правится вовсе, и это
    // лучше, чем правится (дизайн, 5.2).
    expect(await bodyParserTouched('video/mp4')).toBe(false);
  });

  it('негодный паспорт отвергается схемой', async () => {
    expect((await acceptWith({ occurredOn: 'вчера' })).status).toBe(400);
  });

  it('тип вне широкого списка — 415 с перечнем принимаемых', async () => {
    const response = await acceptWith({ uploadType: 'video/x-msvideo' });

    expect(response.status).toBe(415);
    expect(response.body.acceptedTypes.length).toBeGreaterThan(0);
  });

  it('видео без ffmpeg — 409, а не 415', async () => {
    // Формат законен, негодна установка. 415 сказал бы «такого формата
    // не бывает», и человек пошёл бы искать другой файл вместо того,
    // чтобы попросить администратора (дизайн, 5.3).
    withoutFfmpeg();

    const response = await acceptWith({ uploadType: 'video/mp4' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe(RECORDING_NEEDS_FFMPEG);
  });

  it('тело больше предела загрузки — названный код с настоящим числом', async () => {
    const response = await acceptHuge();

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ code: RECORDING_TOO_LARGE, maxBytes: 2_147_483_648 });
  });

  it('предел загрузки читается при каждом запросе, без перезапуска', async () => {
    // Выигрыш от приёма потоком: у `express.raw` предел читался один
    // раз при подъёме, и про это приходилось извиняться.
    process.env.CAIRN_RECORDING_MAX_BYTES = '1024';

    expect((await acceptWith({})).body.maxBytes).toBe(1024);
  });

  it('без выдачи на хронику — 404', async () => {
    expect((await acceptAs(outsider)).status).toBe(404);
  });

  it('уровень ниже записи — 403', async () => {
    expect((await acceptAs(reader)).status).toBe(403);
  });

  it('отдаёт дорожку потоком с поддержкой перемотки', async () => {
    // Без Range перемотка в <audio> не работает, а переслушать спорное
    // место — это ровно про перемотку.
    const response = await request(app)
      .get(`/api/projects/${projectId}/summaries/${summaryId}/recording`)
      .set('Range', 'bytes=0-9');

    expect(response.status).toBe(206);
    expect(response.headers['accept-ranges']).toBe('bytes');
  });

  it('отдаёт дорожку, а не загруженное видео', async () => {
    // Отдавать полгигабайта, чтобы услышать спорную фразу, незачем;
    // исходник лежит на томе и ручкой не отдаётся вовсе (дизайн, 3.3).
    const response = await getRecording();

    expect(response.headers['content-type']).toBe('audio/ogg');
  });

  it('в заголовках отдачи нет имени файла', async () => {
    const response = await getRecording();

    expect(response.headers['content-disposition']).toBe('inline');
  });

  it('отсутствующий файл — 404 с названным кодом', async () => {
    await unlinkRecording();

    expect((await getRecording()).body.code).toBe(RECORDING_MISSING);
  });

  it('повторная расшифровка при идущей — 409', async () => {
    expect((await retry()).body.code).toBe(TRANSCRIPTION_ALREADY_RUNNING);
  });

  it('настройки службы не несут ключа и каталога', async () => {
    const response = await request(app).get('/api/summaries/transcriber');

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
  });

  it('принимаемый список считает сервер, с учётом ffmpeg', async () => {
    // Вычитать списки в браузере значило бы завести второе место, где
    // живёт правило, и первым же расхождением показать человеку формат,
    // который сервер отвергнет.
    withoutFfmpeg();

    const response = await request(app).get('/api/summaries/transcriber');

    expect(response.body.canExtract).toBe(false);
    expect(response.body.acceptedTypes).toHaveLength(3);
  });

  it('очередь по всем проектам пуста, а не 404, без подходящих проектов', async () => {
    // Пустой список — законный ответ, и он ничего не раскрывает.
    const response = await asSubject(outsider).get('/api/summaries/transcriptions');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/transcriptions.controller.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать контроллеры, отдачу файла и приём тела**

Шесть ручек проекта по таблице раздела 5.1 дизайна плюс две у верхнего контроллера. Guard'а уровня нет — уровень проверяет репозиторий.

**`main.ts` не правится вовсе** — и это правка по сравнению с первой редакцией плана, где туда добавлялся `express.raw`. Разборщика тела для медиа-типов не устанавливается: `express.json()` и `urlencoded()` стоят на своих типах содержимого, `text({ type: 'text/plain' })` — на своём, и `video/mp4` не касается никто. Контроллер берёт `@Req()` и отдаёт поток в `store.accept` (Task 6).

Отдача записи — `res.sendFile(абсолютный путь)` **дорожки**: `Accept-Ranges` и `206` он ставит сам, своего разбора `Range` писать не нужно. `Content-Disposition: inline` **без** `filename`.

В `SummariesRepository.detailOf` — два вычисляемых поля (`recording`, `transcription`) из последней задачи саммари. Это правка проекции, не схемы: колонок у `summaries` не добавляется.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries && npx vitest run src/app.module.test.ts`
Expected: PASS — включая проверку, что модуль поднимается со всеми новыми провайдерами (**двумя** портами, прогоном и его соединением под замок)

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/summaries
git commit -m "Открыть ручки расшифровки и приём записи потоком"
```

---

## Чанк 5: Веб

### Task 16: Чтение записи в браузере

**Files:**
- Create: `apps/web/src/components/SummaryForm/readRecording.ts`
- Create: `apps/web/src/components/SummaryForm/readRecording.test.ts`

Порядок проверок обязателен и тот же, что первая итерация установила для текстового файла.

- [ ] **Step 1: Написать падающий тест**

```ts
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

  it('имя файла в результат не попадает', async () => {
    // Имена файлов на машинах людей нередко говорят больше, чем
    // содержимое.
    const read = await readRecording(
      fakeFile({ name: 'Клиент Б, разбор инцидента.mp4', head: ISO_BMFF }),
      SETTINGS,
    );

    expect(JSON.stringify(read)).not.toContain('Клиент');
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/SummaryForm/readRecording.test.ts`
Expected: FAIL — модуль не найден

- [ ] **Step 3: Написать функцию**

Четыре шага по разделу 8.2 дизайна: размер → расширение (и сверка с `acceptedTypes`, пришедшими с сервера) → подпись (`file.slice(0, RECORDING_HEAD_BYTES)`, семейство) → результат `{ file, uploadType, bytes }`. Отказы — объектами с `code` из контракта, а не строками: экран разбирает код.

Вторым аргументом идут **настройки с сервера**, а не одно число: предел загрузки и список принимаемых типов приходят оттуда вместе, и собирать список в браузере значило бы завести второе место, где живёт правило.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/SummaryForm/readRecording.test.ts`
Expected: PASS, 7 тестов

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/SummaryForm/readRecording.ts apps/web/src/components/SummaryForm/readRecording.test.ts
git commit -m "Проверять запись в браузере до отправки"
```

### Task 17: Сырое тело в клиенте и загрузка с прогрессом

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/api/client.test.ts`
- Create: `apps/web/src/api/upload-recording.ts`
- Create: `apps/web/src/api/upload-recording.test.ts`
- Modify: `apps/web/src/api/summary-failure.ts`
- Modify: `apps/web/src/api/summary-failure.test.ts`

Правка общего клиента — для мелких сырых тел. Загрузку записи через него не ведут: `fetch` не даёт прогресса отправки, а на двух гигабайтах прогресс обязателен (дизайн, 8.2 и 8.4).

- [ ] **Step 1: Написать падающий тест**

```ts
it('сырое тело уходит как есть, с заданным типом', async () => {
  await apiClient('/путь', { method: 'POST', body: BLOB, contentType: 'audio/mpeg' });

  expect(fetchMock.mock.calls[0]![1]).toMatchObject({
    body: BLOB,
    headers: { 'Content-Type': 'audio/mpeg' },
  });
});

it('объект по-прежнему сериализуется в JSON', async () => {
  // Сторож прежнего поведения: все существующие запросы не изменились.
  await apiClient('/путь', { method: 'POST', body: { a: 1 } });

  expect(fetchMock.mock.calls[0]![1]).toMatchObject({
    body: '{"a":1}',
    headers: { 'Content-Type': 'application/json' },
  });
});

it('предел размера из отказа берётся, а не подставляется своим', async () => {
  // Настройка узла: подставить своё число значило бы соврать о чужой
  // настройке — то же решение, что у maxChars. Поле одно на оба
  // предела: код отказа уже говорит, о каком пределе речь.
  expect(summaryFailureOf(apiErrorWith({ code: RECORDING_TOO_LARGE, maxBytes: 1 })).maxBytes).toBe(1);
});

describe('загрузка записи', () => {
  it('сообщает процент по ходу отправки', async () => {
    // На двух гигабайтах неопределённый индикатор на двадцать минут
    // читается как зависший экран.
    const seen: number[] = [];

    const promise = uploadRecording(URL, FILE, 'video/mp4', (percent) => seen.push(percent));

    xhrStub.progress(50_000_000, 500_000_000);
    xhrStub.progress(500_000_000, 500_000_000);
    xhrStub.succeed({ id: ID });
    await promise;

    expect(seen).toEqual([10, 100]);
  });

  it('прикладывает cookie сессии', async () => {
    // Без withCredentials любой защищённый маршрут ответит отказом.
    expect(xhrStub.withCredentials).toBe(true);
  });

  it('отказ разбирается той же ApiError, что у fetch-запросов', async () => {
    // Второй путь разбора отказов был бы вторым местом, где живёт одно
    // правило, и показал бы человеку общую фразу вместо причины.
    xhrStub.fail(413, { code: RECORDING_TOO_LARGE, maxBytes: 2_147_483_648 });

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ details: { maxBytes: 2_147_483_648 } });
  });

  it('отмена прерывает запрос', async () => {
    // Кнопки «Отменить загрузку» у fetch-запросов в приложении нет
    // нигде; здесь она нужна, потому что ждать двадцать минут молча
    // человек не должен.
    controller.abort();

    expect(xhrStub.aborted).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/api`
Expected: FAIL — `contentType` в опциях нет, модуль `upload-recording` не найден

- [ ] **Step 3: Расширить клиент и написать загрузку**

`Blob`/`ArrayBuffer` в `body` уходит как есть, `Content-Type` — из новой опции. `summaryFailureOf` получает `maxBytes` по образцу `maxChars`.

`upload-recording.ts` — одна функция на `XMLHttpRequest`. TSDoc обязан сказать, **почему здесь не `fetch`** (нет прогресса отправки), и что это единственное место в приложении с `XHR`. Разбор отказа идёт через ту же `ApiError`, что строит `readResponse`, — общий код выделить, а не скопировать.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/api`
Expected: PASS, включая все прежние проверки клиента

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/api
git commit -m "Загружать запись с прогрессом, не ломая общий клиент"
```

### Task 18: Хуки, форма, очередь, плеер

**Files:**
- Create: `apps/web/src/api/hooks/useQueryTranscriptions.ts`
- Create: `apps/web/src/api/hooks/useMutationTranscription.ts`
- Create: `apps/web/src/api/hooks/useQueryTranscriptions.test.tsx`
- Create: `apps/web/src/components/TranscriptionQueue/` (компонент, `types.ts`, `constants.ts`, `index.ts`, тест)
- Create: `apps/web/src/components/SummaryRecording/` (то же)
- Modify: `apps/web/src/components/SummaryForm/SummaryForm.tsx`, `constants.ts`, `types.ts`, тест
- Modify: `apps/web/src/app/(app)/summaries/SummariesScreen.tsx` и тест
- Modify: `apps/web/src/app/(app)/summaries/[id]/SummaryScreen.tsx` и тест
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Написать падающий тест**

Хуки:

```ts
it('опрашивает очередь, пока в ней есть незакрытые', async () => {
  // Иначе открытая вкладка стучала бы в API вечно.
  expect(queryOptions().refetchInterval).toBe(10_000);
});

it('перестаёт опрашивать, когда незакрытых не осталось', async () => {
  expect(queryOptionsFor([DONE_JOB]).refetchInterval).toBe(false);
});
```

Форма:

```ts
it('третий способ дать текст: загрузить запись', async () => {
  renderForm();

  expect(screen.getByLabelText('Загрузить запись')).toBeInTheDocument();
});

it('выбор записи убирает поле текста', async () => {
  await chooseRecording();

  expect(screen.queryByLabelText('Текст')).not.toBeInTheDocument();
});

it('над выбором записи постоянно написано, что уйдёт наружу', async () => {
  // Постоянная неубираемая подпись, а не всплывающая: диалог, который
  // человек видит двадцатый раз, перестаёт читаться.
  await chooseRecording();

  expect(screen.getByText(/извлекается .*звуковая дорожка/)).toBeInTheDocument();
  expect(screen.getByText(/целиком уходит на этот адрес/)).toBeInTheDocument();
});

it('сказано, что видео наружу не уходит', async () => {
  // Новое и приятное следствие извлечения: демонстрация экрана и лица
  // участников не уходят физически, а не по обещанию.
  await chooseRecording();

  expect(screen.getByText(/видео не уходит/)).toBeInTheDocument();
});

it('сказано и то, что в записи есть всё сказанное', async () => {
  // Это ровно тот довод, которым дизайн объясняет, почему запись
  // тяжелее текста, и извлечение его не отменяет: в дорожке сказанного
  // ровно столько же, сколько в исходнике.
  await chooseRecording();

  expect(screen.getByText(/включая то, чего в тексте не будет/)).toBeInTheDocument();
});

it('без ffmpeg сказано, что файл уходит как есть', async () => {
  // Там он и уходит как есть — врать подписью нельзя.
  await chooseRecording({ canExtract: false });

  expect(screen.getByText(/как есть/)).toBeInTheDocument();
});

it('у локальной службы сказано, что запись не покидает машину', async () => {
  await chooseRecording({ kind: 'local', host: 'whisper.internal' });

  expect(screen.getByText(/не покидает машину/)).toBeInTheDocument();
});

it('предлагает те форматы, которые примет эта установка', async () => {
  // accept у поля файла — из acceptedTypes с сервера; свой список в
  // браузере разошёлся бы с серверным.
  renderForm({ canExtract: false, acceptedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'] });

  expect(screen.getByLabelText('Загрузить запись')).toHaveAttribute(
    'accept',
    'audio/mpeg,audio/wav,audio/ogg',
  );
});

it('при выключенной службе выбора записи нет, но есть объяснение', async () => {
  // Предложить загрузить файл, который никуда не поедет, значит
  // предложить впустую; промолчать — заставить искать.
  renderForm({ isEnabled: false });

  expect(screen.queryByLabelText('Загрузить запись')).not.toBeInTheDocument();
  expect(screen.getByText('Расшифровка записи не настроена')).toBeInTheDocument();
});

it('показывает настоящий процент загрузки', async () => {
  // Правка по сравнению с первой редакцией: неопределённый индикатор
  // годился при сорока мегабайтах, а на двух гигабайтах читается как
  // зависший экран.
  await submitRecording();
  upload.progress(10);

  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
});
```

Очередь:

```ts
it('блока нет, когда очередь пуста', () => {
  renderQueue([]);

  expect(screen.queryByText('Расшифровки')).not.toBeInTheDocument();
});

it('называет состояние словами, а не кодом', () => {
  renderQueue([{ ...JOB, state: 'running' }]);

  expect(screen.getByText(/Расшифровывается/)).toBeInTheDocument();
});

it('извлечение называется извлечением, а не «в очереди»', () => {
  // Главная причина, по которой состояние не слили с queued:
  // извлечение часового видео это минуты, и «В очереди» всё это время
  // было бы неправдой о том, чего человек ждёт.
  renderQueue([{ ...JOB, state: 'extracting' }]);

  expect(screen.getByText(/Извлекаем звуковую дорожку/)).toBeInTheDocument();
});

it('показывает оба размера: что загрузили и что уйдёт', () => {
  // Единственное место, где человеку видно, что именно уйдёт наружу.
  renderQueue([{ ...JOB, uploadBytes: 566_231_040, audioBytes: 11_534_336 }]);

  expect(screen.getByText(/540 МБ → 11 МБ/)).toBeInTheDocument();
});

it('у отправки отмены нет: байты уже в пути', () => {
  renderQueue([{ ...JOB, state: 'sending' }]);

  expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
});

it('у извлечения отмена есть и действительно прерывает работу', () => {
  // Единственная отмена в системе, которая отменяет работу, а не
  // только закрывает строку.
  renderQueue([{ ...JOB, state: 'extracting' }]);

  expect(screen.getByRole('button', { name: 'Отменить' })).toBeEnabled();
});

it('неудача называет причину и даёт повторить', () => {
  renderQueue([{ ...JOB, state: 'failed', failureCode: 'transcription_interrupted' }]);

  expect(screen.getByText(/Передача прервана перезапуском/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Расшифровать снова' })).toBeInTheDocument();
});

it.each([
  ['recording_no_audio_track', /нет звука/],
  ['recording_broken', /не читается/],
  ['recording_codec_unsupported', /не умеем раскодировать/],
  ['extraction_failed', /Не удалось извлечь/],
  ['extraction_timed_out', /не завершилось/],
  ['transcription_too_large', /слишком длинный/],
  ['recording_needs_ffmpeg', /извлечение дорожки не настроено/],
])('%s объясняется своей фразой', (failureCode, phrase) => {
  // Три отказа извлечения человек разбирает по-разному: выгрузить
  // заново со звуком, выгрузить заново целиком, просто нажать «снова».
  // Один общий код «не вышло» отправил бы его делать не то.
  renderQueue([{ ...JOB, state: 'failed', failureCode }]);

  expect(screen.getByText(phrase)).toBeInTheDocument();
});

it('успешных в очереди нет: саммари уже в истории', () => {
  renderQueue([{ ...JOB, state: 'done' }]);

  expect(screen.queryByRole('row')).not.toBeInTheDocument();
});
```

Плеер:

```ts
it('показывает плеер, размер дорожки и судьбу исходника', () => {
  // Человек загружал видео, а слушает звук, и экран говорит это прямо,
  // чтобы он не удивился (дизайн, 8.5). Плюс говорит, куда девался
  // загруженный файл: иначе на этот вопрос отвечать нечем, кроме кода.
  renderRecording({
    bytes: 11_534_336,
    mediaType: 'audio/ogg',
    uploadBytes: 566_231_040,
    uploadType: 'video/mp4',
    isSourceRemoved: true,
  });

  expect(screen.getByText(/дорожка 11 МБ/)).toBeInTheDocument();
  expect(screen.getByText(/загружено было видео 540 МБ/i)).toBeInTheDocument();
  expect(screen.getByText(/исходник убран после расшифровки/)).toBeInTheDocument();
  expect(screen.getByTestId('recording-audio')).toHaveAttribute('controls');
});

it('у саммари из mp3 про уборку не пишет: убирать было нечего', () => {
  // Исходник и дорожка — один файл, и «исходник убран» было бы
  // неправдой (дизайн, 3.3 следствие 3).
  renderRecording({
    bytes: 10_000_000,
    mediaType: 'audio/mpeg',
    uploadBytes: 10_000_000,
    uploadType: 'audio/mpeg',
    isSourceRemoved: false,
  });

  expect(screen.getByText(/Запись созвона: 10 МБ/)).toBeInTheDocument();
  expect(screen.queryByText(/исходник/)).not.toBeInTheDocument();
});

it('без записи вместо плеера объяснение', () => {
  renderRecording(null);

  expect(screen.getByText('Запись недоступна')).toBeInTheDocument();
});

it('повторная расшифровка спрашивает подтверждение', async () => {
  // Кнопка перезаписывает ту самую колонку, которую человек правил.
  await userEvent.click(screen.getByRole('button', { name: 'Расшифровать снова' }));

  expect(screen.getByText(/Ваши правки текста пропадут/)).toBeInTheDocument();
});

it('подтверждение называет и последствие для задач', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Расшифровать снова' }));

  expect(screen.getByText(/задачи будут помечены возможно устаревшими/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/web && npx vitest run src/components/TranscriptionQueue src/components/SummaryRecording src/components/SummaryForm`
Expected: FAIL — компоненты не найдены

- [ ] **Step 3: Написать хуки и компоненты**

По разделу 8 дизайна. Карта кодов отказа в русские фразы — в `constants.ts` компонента очереди, по образцу `FAILURE_MESSAGES` первой итерации: код интерфейс разбирает, фразу можно переписать.

Компоненты — до 100 строк каждый, пропсы `IProps` в `types.ts`, массивы и карты из JSX — в `constants.ts`.

- [ ] **Step 4: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src`
Expected: PASS, включая все прежние тесты веба

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src
git commit -m "Загружать запись созвона, видеть очередь и переслушивать"
```

### Task 19: Русские названия действий журнала

**Files:**
- Modify: `apps/web/src/components/AuditTable/constants.ts`

Сторож вычитывает перечень из исходника API регекспом и падает на действии без названия.

- [ ] **Step 1: Прогнать сторожа и убедиться, что он падает**

Run: `cd apps/web && npx vitest run src/components/AuditTable/constants.test.ts`
Expected: FAIL — пять действий без русского названия

- [ ] **Step 2: Дописать названия**

```ts
[AuditAction.SummaryRecordingUploaded]: 'Загружена запись созвона',
[AuditAction.SummaryTranscriptionRequested]: 'Запись отправлена на расшифровку',
[AuditAction.SummaryTranscriptionFailed]: 'Расшифровка не удалась',
[AuditAction.SummaryTranscribed]: 'Запись расшифрована',
[AuditAction.SummaryTranscriptionDeleted]: 'Удалена загруженная запись',
```

- [ ] **Step 3: Прогнать — должно пройти**

Run: `cd apps/web && npx vitest run src/components/AuditTable`
Expected: PASS

- [ ] **Step 4: Коммит**

```bash
git add apps/web/src/components/AuditTable/constants.ts
git commit -m "Назвать по-русски действия расшифровки в журнале"
```

---

## Чанк 6: Развёртывание, документация, проверка

### Task 19a: `ffmpeg` в образе, и установка без него остаётся рабочей *(новая задача)*

**Files:**
- Modify: `apps/api/Dockerfile`
- Create: `apps/api/src/summaries/transcription/without-ffmpeg.test.ts`

Образ собран на `node:22-alpine` в обеих ступенях — это проверено чтением, а не предположено. Значит `apk add`, а не `apt-get`.

- [ ] **Step 1: Написать падающий тест на то, что без `ffmpeg` поток рабочий**

Это не тест Dockerfile (его нечем проверить в Vitest), а тест **обещания**, которое Dockerfile подкрепляет. Обещание важнее пакета: именно оно делает зависимость необязательной.

```ts
describe('установка без ffmpeg', () => {
  it('принимает уже-пригодное аудио', async () => {
    // Без ffmpeg поток остаётся рабочим, только уже: это то же
    // правило, что «без ключа порт выключен».
    await expect(
      service.accept(writer, projectId, { ...PASSPORT, uploadType: 'audio/mpeg' }, mp3Stream()),
    ).resolves.toBeDefined();
  });

  it('видео отвергает названным кодом, а не общей ошибкой', async () => {
    await expect(
      service.accept(writer, projectId, { ...PASSPORT, uploadType: 'video/mp4' }, mp4Stream()),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: RECORDING_NEEDS_FFMPEG }) });
  });

  it('сужает список принимаемых форматов, а не врёт о нём', async () => {
    expect(service.transcriberInfo().acceptedTypes).toEqual([
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
    ]);
    expect(service.transcriberInfo().canExtract).toBe(false);
  });

  it('крупное аудио тоже отвергает: урезать его нечем', async () => {
    await expect(
      service.accept(writer, projectId, { ...PASSPORT, uploadType: 'audio/mpeg' }, bigMp3Stream()),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: RECORDING_NEEDS_FFMPEG }) });
  });

  it('остальной поток саммари не задет вовсе', async () => {
    // Текст вставляется руками, задачи набираются, релиз формируется —
    // ни один уровень настройки не ломает уже работающую возможность.
    await expect(summaries.create(writer, projectId, TEXT_INPUT)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `cd apps/api && npx vitest run src/summaries/transcription/without-ffmpeg.test.ts`
Expected: FAIL — пока порт извлечения и `prepareDecision` не связаны службой

- [ ] **Step 3: Дописать `Dockerfile`**

В **ступень `runner`**, не в `builder`:

```dockerfile
# ffmpeg и ffprobe: из загруженного файла извлекается звуковая дорожка
# (дизайн 2026-11-17, раздел 7.6). Только в runner: сборке они не нужны.
# Без пакета установка остаётся рабочей — принимаются MP3, WAV и OGG,
# а видео получает названный отказ recording_needs_ffmpeg.
RUN apk add --no-cache ffmpeg
```

- [ ] **Step 4: Измерить размер образа, а не угадать**

```bash
docker image ls cairn-api:latest          # до
docker compose build api
docker image ls cairn-api:latest          # после
```

Разницу вписать в README рядом с требованиями к серверу. **Называть цифру, которую не мерил, нельзя** — это ровно то, чего дизайн избегает в части Yandex.

- [ ] **Step 5: Прогнать — должно пройти**

Run: `cd apps/api && npx vitest run src/summaries`
Expected: PASS, 5 новых тестов

- [ ] **Step 6: Коммит**

```bash
git add apps/api/Dockerfile apps/api/src/summaries
git commit -m "Положить ffmpeg в образ API, не делая его обязательным"
```

### Task 20: Тринадцать переменных и том в трёх местах

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`

Пропущенная в compose переменная уже стоила проекту дефекта с интервалом проверок — комментарий об этом висит в `docker-compose.yml`, и у блока предложителя он повторён. Повторить и здесь.

- [ ] **Step 1: Дописать `.env.example`**

Раздел «Расшифровка записи созвона» после раздела разбивки, **тринадцать** переменных с объяснениями. Обязательно сказать прямо:

- **наружу уходит звуковая дорожка созвона целиком**, и в ней есть всё сказанное, включая то, чего в тексте саммари не будет; **видео наружу не уходит** — из файла берётся только звук;
- **умолчание `off`**: на свежей установке ничего никуда не уходит;
- внешнему адаптеру нужны **и ключ, и каталог** (`x-folder-id` у SpeechKit не опционален);
- у `local` умолчания адреса нет намеренно;
- заголовок логирования данных не отправляется никогда, поэтому провайдер аудио не сохраняет; **результаты** распознавания живут у него 3 суток и убираются нами сразу после укладки текста;
- **два предела, и они про разное**: загрузка 2 ГиБ (выведен из четырёх часов — предела длительности у службы) и отправка 40 МиБ (выведен из 60 МБ предела тела минус раздувание `base64`). После извлечения второй почти перестаёт быть границей: часовой созвон — 11 МБ;
- **принимаются и видеоконтейнеры** (MP4, MOV, MKV, WEBM) и аудио (MP3, M4A, WAV, OGG, FLAC) — **пока в образе есть `ffmpeg`**. Без него принимаются только MP3, WAV и OGG, а видео получает названный отказ: установка остаётся рабочей, только уже;
- **битрейт извлечения не измерен на живом материале** — умолчание 24 кбит/с выбрано арифметикой;
- **записи лежат на томе и в резервную копию базы не входят** — восстановление из копии даёт саммари, записи которых нет;
- **загруженный исходник убирается, когда текст уложен**; остаётся звуковая дорожка, и именно она хранится, пока живёт саммари. При любой неудаче исходник остаётся — повторить попытку есть из чего. Переслушивать и расшифровывать снова можно и после уборки: повтор работает с дорожкой;
- **запас диска считается по пику, а не по покою**: в покое том держит только дорожки (единицы мегабайт на созвон), а пик равен пределу загрузки на число идущих расшифровок — при одной за тик это единицы гигабайт. Запас всё равно нужен: на `ENOSPC` загрузка падает названным отказом;
- **переизвлечь дорожку с другим битрейтом нельзя** — исходника больше нет. Если битрейт захочется померить, мерить надо на свежей загрузке.

- [ ] **Step 2: Дописать `docker-compose.yml`**

Все тринадцать переменных в `api.environment` — **все до одной**, с комментарием о причине (процесс в контейнере видит только то, что ему передали). Плюс том:

```yaml
    volumes:
      - recordings-data:/var/lib/cairn/recordings
```

и `recordings-data:` в `volumes:` внизу. Комментарий у тома обязан сказать две вещи: что он **не входит в `scripts/backup.sh`** (и почему это принятое решение, а не недосмотр), и что запас диска считается **по пику**, а не по покою — в покое лежат только дорожки, но идущая расшифровка держит загруженный файл до предела загрузки.

- [ ] **Step 3: Дописать README**

Раздел «Расшифровка записи созвона» рядом с существующими: что включает, что уходит наружу (**дорожка, не видео**), какие форматы принимаются с `ffmpeg` и без него, **оба предела с их выводом**, где лежат файлы, **что исходник убирается при укладке текста, а дорожка живёт, пока живёт саммари**, сколько места это требует (пик, не покой), что файлов нет в резервной копии, и насколько вырос образ (число из Task 19a, шаг 4 — измеренное, не выдуманное).

Плюс строка о том, какие детали API Yandex **требуют живой проверки** (таблица из дизайна, пункты 1–6) — чтобы тот, кто первым подключит живой ключ, знал, что смотреть, — и строка про неизмеренный битрейт (11.1, пункт 5).

- [ ] **Step 4: Проверить, что compose разбирается**

Run: `docker compose config > /dev/null && echo ok`
Expected: `ok` — все тринадцать переменных и том разобрались

- [ ] **Step 5: Коммит**

```bash
git add .env.example docker-compose.yml README.md
git commit -m "Описать расшифровку записи в окружении, compose и README"
```

### Task 21: `CLAUDE.md` и полная проверка

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Дописать состояние репозитория**

Абзац после абзаца о конструкторе задач: вторая итерация — загрузка записи созвона (видео или аудио), извлечение звуковой дорожки через `ffmpeg` в образе API и её расшифровка внешней службой; задача со состоянием в базе под замком, как прогон проверок; **запись, которая хранится, пока живёт саммари, — это дорожка, а загруженный исходник убирается, когда текст уложен (и остаётся при любой неудаче)**; **ни одна таблица первой итерации не изменилась**, потому что саммари рождается из готового текста; наружу уходит дорожка, а не видео; два предела — на загрузку и на отправку; без ключей порт выключен, а без `ffmpeg` принимаются только MP3, WAV и OGG, и в обоих случаях установка остаётся рабочей.

- [ ] **Step 2: Дописать источники правды**

```
- `docs/superpowers/specs/2026-11-17-cairn-summary-transcription-design.md` и
  одноимённый план — расшифровка записи созвона: извлечение дорожки через
  `ffmpeg`, порт к службе, фоновая задача, рождение саммари из готового текста.
```

- [ ] **Step 3: Полная проверка**

Run: `pnpm test`
Expected: PASS целиком, включая интеграционные на Testcontainers

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm build`
Expected: API собирается; **сборка веба на Windows падает на `EPERM` при symlink — это свойство среды, а не дефект** (память проекта). На Linux должна пройти целиком.

- [ ] **Step 4: Коммит**

```bash
git add CLAUDE.md
git commit -m "Записать расшифровку записи созвона в состояние репозитория"
```

---

## Что проверить глазами перед тем, как считать готовым

Десять мест, где тест проходит, а дизайн нарушен, — их придётся посмотреть руками:

1. **Частичный уникум в миграции.** Потерянный `WHERE` запретил бы повторную расшифровку навсегда вместо запрета гонки; **выпавший из списка `extracting`** позволил бы двум `ffmpeg` писать в один файл и двум расшифровкам — в один `content`. Тесты Task 5 шага 6 это ловят, но посмотреть `cat apps/api/drizzle/*_transcription*.sql` всё равно нужно.
2. **Запись в журнал идёт до сети.** Тест держит это подменённым портом, который проверяет журнал внутри `start`. Если порядок переставят, тест упадёт — но убедиться, что он именно такой, стоит глазами: `grep -n "SummaryTranscriptionRequested" -A5 -B5 apps/api/src/summaries/transcription/transcription-runner.service.ts`.
3. **Наружу уходит дорожка, а не загруженный файл.** `grep -n "uploadPath\|upload_path" apps/api/src/summaries/transcription/yandex-speechkit.transcriber.ts` — **пусто**. Порт расшифровки загруженного файла не видит вовсе, и это самое дорогое из того, что можно сломать незаметно.
4. **`x-data-logging-enabled` нигде нет.** `grep -rn "data-logging" apps/api/src` должен находить только тест и комментарий, никогда — отправляемый заголовок.
5. **`ffmpeg` зовётся без оболочки.** `grep -n "spawn\|execFile\|exec(" apps/api/src/summaries/transcription/ffmpeg.extractor.ts` — аргументы массивом, `shell: true` нигде, `--` перед путями, `-nostdin` и `-vn` на месте. В проекте это первый дочерний процесс, образца рядом нет, и проверить надо глазами.
6. **`stderr` от `ffmpeg` не уходит ни в отказ, ни в журнал.** `grep -n "stderr" apps/api/src/summaries/transcription/` — только `logger`, никогда `ExtractionFailure` и никогда `metadata`.
7. **Имени файла нет нигде.** `grep -rni "fileName\|originalName" apps/api/src/summaries` — пусто.
8. **Файлы удаляются после фиксации, кроме приёма.** `unlink` не должен встречаться внутри `db.transaction` ни в одном месте: `grep -n "store.remove" -B10 apps/api/src/summaries` — вызов обязан быть после закрывающей скобки транзакции. **Единственное исключение** — уборка недописанного файла в `recording-store.accept`: там строки в базе ещё нет, фиксировать нечего, и уборка идёт в `finally`.
9. **Тринадцать переменных ровно в трёх местах.** Сверить списком: `grep -c "CAIRN_TRANSCRIB\|CAIRN_TRANSCRIPTION\|CAIRN_RECORDING" .env.example docker-compose.yml README.md` — числа должны совпадать. Внимание к префиксу: `CAIRN_RECORDINGS_DIR` и `CAIRN_RECORDING_*` отличаются одной буквой, и `grep` по `CAIRN_RECORDINGS` найдёт только первую.
10. **`ffmpeg` только в ступени `runner`.** `grep -n "apk add" apps/api/Dockerfile` — одна строка, и она после второго `FROM`. В `builder` пакет не нужен и утяжелил бы сборку.
11. **Исходник убирается только на `done`.** `grep -rn "forgetSource\|upload_path: null\|uploadPath: null" apps/api/src/summaries` — вызов обязан быть в одном месте службы, на пути укладки текста, и **нигде** на путях отказов. Ни одна строка таблицы отказов (дизайн, 7.5) не вправе уносить загруженный файл; единственное исключение — потеря доступа (6.5), и оно названо в коде комментарием.
12. **Единственный файл не удаляется.** Там же: перед уборкой обязано стоять сравнение `upload_path` с `audio_path`. Без него саммари из `mp3` теряло бы свою единственную запись на первом же успехе — тихо и необратимо.
13. **Номера миграций не из плана.** `ls apps/api/drizzle/*.sql | tail -4` и `git log --oneline -3 -- apps/api/drizzle/meta/` — убедиться, что номер взят по факту каталога, а не скопирован из этого документа, и что снапшот сгенерирован, а не слит руками.

## Живая проверка Yandex — отдельно от плана

Шесть пунктов таблицы проверок дизайна требуют живого ключа и к этому плану не относятся: по ним работают, когда ключ появится. Но два из них влияют на код, и к ним надо вернуться сразу после первого успешного вызова:

- **опции распознавания** (`text_normalization`, `language_restriction`,
  `audio_processing_type`) — адаптер их не отправляет до проверки; с ними текст
  будет с пунктуацией и заметно читабельнее;
- **формат ответа `getRecognition`** — функция `transcriptOf` написана
  снисходительной именно потому, что формат не проверен; первый живой ответ
  стоит сохранить в тест как есть, байт в байт.

И один пункт — не про расшифровку, а про **разбивку на задачи**: проходит ли
YandexGPT через существующий OpenAI-совместимый адаптер предложителя. Он шлёт
`Authorization: Bearer`, а Yandex ждёт `Api-Key`. Проверяется одной командой
(дизайн, раздел 11.1 пункт 1); если `401` — рекомендация там же: одна настройка
схемы авторизации в существующем адаптере, а не второй класс.

## Измерить на живом материале — тоже отдельно от плана

Два числа этого дизайна выведены арифметикой и **не измерены**. Мерить их надо
на том же созвоне, на котором будет проверяться живой ключ:

- **битрейт извлечения.** Умолчание 24 кбит/с даёт запас ровно до
  провайдерского предела длительности (дизайн, 3.6). Сравнить расшифровки при
  16, 24 и 32 кбит/с. Если 32 заметно лучше — умолчание придётся менять вместе
  с пределом отправки, потому что при 32 кбит/с четыре часа не влезают в тело
  запроса, и тогда понадобится либо бакет, либо нарезка (дизайн, 11.1 пункт 5);
- **размер образа API после `apk add ffmpeg`** (Task 19a, шаг 4). Пакет в
  Alpine много легче своего Debian-аналога, но «много легче» — не число, и в
  README должно стоять измеренное.
