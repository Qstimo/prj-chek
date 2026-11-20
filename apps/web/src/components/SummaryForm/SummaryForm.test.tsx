import {
  DEFAULT_MAX_SEND_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES,
  ProjectLifecycle,
  RECORDING_HEAD_BYTES,
  TranscriberKind,
  UPLOAD_TYPES,
  type ProjectMetadata,
  type TranscriberInfo,
} from '@cairn/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FIELD_LABELS, SOURCE_LABELS } from './constants';
import { SummaryForm } from './SummaryForm';

const PROJECT: ProjectMetadata = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'cairn',
  name: 'CAIRN',
  lifecycle: ProjectLifecycle.Active,
};

/** Настройки расшифровки, какими их отдаёт `GET /summaries/transcriber`. */
const TRANSCRIBER: TranscriberInfo = {
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

/** ISO-BMFF: так начинается mp4. */
const ISO_BMFF = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32];

/** Файл с настоящей подписью в голове: читается только она. */
function recordingFile(name = 'созвон.mp4', head = ISO_BMFF): File {
  const bytes = new Uint8Array(RECORDING_HEAD_BYTES);

  bytes.set(head);

  return new File([bytes], name);
}

/** Файл с заданным содержимым и именем. */
function fileWith(text: string, name: string): File {
  return new File([text], name);
}

/** Форма с загрузкой записи и заданными настройками службы. */
function renderForm(
  settings: Partial<TranscriberInfo> = {},
  recording: { percent?: number; onSubmit?: ReturnType<typeof vi.fn> } = {},
): { onSubmit: ReturnType<typeof vi.fn>; onSubmitRecording: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn();
  const onSubmitRecording = recording.onSubmit ?? vi.fn();

  render(
    <SummaryForm
      projects={[PROJECT]}
      onSubmit={onSubmit}
      recording={{
        transcriber: { ...TRANSCRIBER, ...settings },
        onSubmit: onSubmitRecording,
        ...(recording.percent === undefined ? {} : { percent: recording.percent }),
      }}
    />,
  );

  return { onSubmit, onSubmitRecording };
}

/** Переключает способ на «Загрузить запись». */
async function chooseRecording(settings: Partial<TranscriberInfo> = {}): Promise<
  ReturnType<typeof renderForm>
> {
  const handlers = renderForm(settings);

  await userEvent.selectOptions(screen.getByLabelText(FIELD_LABELS.source), SOURCE_LABELS.recording);

  return handlers;
}

describe('форма создания саммари', () => {
  it('пустой список проектов объясняет, почему, и формы не показывает', () => {
    // Прятать вкладку значило бы считать выдачи при отрисовке навигации,
    // а форма без единой цели предлагала бы заполнить то, что некуда
    // отправить (дизайн, раздел 7.2: «вместо формы объяснение»).
    render(<SummaryForm projects={[]} onSubmit={vi.fn()} />);

    expect(screen.getByText(/писать хронику/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Создать/ })).not.toBeInTheDocument();
  });

  it('пустой заголовок и пустой текст отправлять не дают', async () => {
    render(<SummaryForm projects={[PROJECT]} onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Создать/ })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Созвон');
    await userEvent.type(screen.getByLabelText(/Текст саммари/), 'обсудили сроки');

    expect(screen.getByRole('button', { name: /Создать/ })).toBeEnabled();
  });

  it('загруженный файл кладёт содержимое в правимое поле', async () => {
    // Человек видит и может поправить то, что отправляет.
    render(<SummaryForm projects={[PROJECT]} onSubmit={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText(/Загрузить файл/), fileWith('текст', 'n.txt'));

    // Чтение файла асинхронно: поле наполняется после ответа FileReader.
    await waitFor(() => expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('текст'));
  });

  it('непустое поле заменяется файлом только после подтверждения', async () => {
    render(<SummaryForm projects={[PROJECT]} onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Текст саммари/), 'моё');

    await userEvent.upload(screen.getByLabelText(/Загрузить файл/), fileWith('чужое', 'n.txt'));

    // Ожидание обязательно: `upload` возвращается, отдав событие, а
    // спросить о замене есть о чём только после ответа FileReader.
    // Без него проверка проходила бы по тому, успел ли он, — то есть
    // падала бы под нагрузкой и проходила в одиночном прогоне.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('моё');

    await userEvent.click(screen.getByRole('button', { name: 'Заменить' }));

    expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('чужое');
  });

  it('негодный файл объясняет отказ и не трогает поле', async () => {
    // Событием, а не `upload`: тот отбрасывает файл по атрибуту `accept`
    // и до проверки расширения дело не доходит. В браузере `accept` —
    // подсказка диалога, которую человек обходит пунктом «Все файлы»,
    // поэтому проверка в коде остаётся настоящей защитой.
    render(<SummaryForm projects={[PROJECT]} onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Текст саммари/), 'моё');

    fireEvent.change(screen.getByLabelText(/Загрузить файл/), {
      target: { files: [fileWith('данные', 'n.pdf')] },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/\.txt/));
    expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('моё');
  });

  it('имя файла нигде не показывается и не уходит', async () => {
    // Имена файлов на машинах людей нередко говорят больше содержимого.
    const onSubmit = vi.fn();
    render(<SummaryForm projects={[PROJECT]} onSubmit={onSubmit} />);

    await userEvent.upload(
      screen.getByLabelText(/Загрузить файл/),
      fileWith('текст', 'секретный-проект.txt'),
    );
    // Дождаться содержимого обязательно: без него поле пусто, отправка
    // выключена, и проверка прошла бы по пустому списку вызовов — то
    // есть не проверила бы ничего.
    await waitFor(() => expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('текст'));
    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Созвон');
    await userEvent.click(screen.getByRole('button', { name: /Создать/ }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(JSON.stringify(onSubmit.mock.calls)).not.toContain('секретный-проект');
    expect(document.body.textContent).not.toContain('секретный-проект');
  });

  it('отправляет выбранный проект и обрезанные поля', async () => {
    const onSubmit = vi.fn();
    render(<SummaryForm projects={[PROJECT]} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/Заголовок/), '  Созвон  ');
    await userEvent.type(screen.getByLabelText(/Текст саммари/), 'обсудили сроки');
    await userEvent.click(screen.getByRole('button', { name: /Создать/ }));

    expect(onSubmit).toHaveBeenCalledWith(PROJECT.id, {
      occurredOn: expect.any(String),
      title: 'Созвон',
      text: 'обсудили сроки',
    });
  });

  it('текст с управляющими символами отправить не даёт', async () => {
    // Нормализация общая с сервером: отказать до отправки честнее, чем
    // получить `400` на том же месте. Вставка, а не набор: управляющий
    // символ попадает в поле буфером обмена, а не с клавиатуры.
    const onSubmit = vi.fn();
    render(<SummaryForm projects={[PROJECT]} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Созвон');
    fireEvent.change(screen.getByLabelText(/Текст саммари/), {
      target: { value: 'раздва' },
    });
    await userEvent.click(screen.getByRole('button', { name: /Создать/ }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('без настроек расшифровки формы записи нет вовсе', () => {
    // Сторож первой итерации: форма без пропса записи работает так же,
    // как работала, и третьего способа не предлагает.
    render(<SummaryForm projects={[PROJECT]} onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText(FIELD_LABELS.source)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Текст саммари/)).toBeInTheDocument();
  });
});

describe('третий способ дать текст: запись созвона', () => {
  it('способ выбирается переключателем над полем', () => {
    renderForm();

    expect(screen.getByLabelText(FIELD_LABELS.source)).toBeInTheDocument();
  });

  it('выбор записи убирает поле текста', async () => {
    await chooseRecording();

    expect(screen.queryByLabelText(/Текст саммари/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(FIELD_LABELS.recording)).toBeInTheDocument();
  });

  it('над выбором записи постоянно написано, что уйдёт наружу', async () => {
    // Постоянная неубираемая подпись, а не всплывающая: диалог, который
    // человек видит двадцатый раз, перестаёт читаться.
    await chooseRecording();

    expect(screen.getByText(/извлекается .*звуковая дорожка/)).toBeInTheDocument();
    expect(screen.getByText(/целиком уходит на этот адрес/)).toBeInTheDocument();
  });

  it('назван узел, который получит запись, и модель', async () => {
    await chooseRecording();

    expect(screen.getByText(/stt\.api\.cloud\.yandex\.net/)).toBeInTheDocument();
    expect(screen.getByText(/модель general/)).toBeInTheDocument();
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
    await chooseRecording({ canExtract: false, acceptedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'] });

    expect(screen.getByText(/как есть/)).toBeInTheDocument();
  });

  it('у локальной службы сказано, что запись не покидает машину', async () => {
    await chooseRecording({ kind: TranscriberKind.Local, host: 'whisper.internal' });

    expect(screen.getByText(/не покидает машину/)).toBeInTheDocument();
  });

  it('предлагает те форматы, которые примет эта установка', async () => {
    // accept у поля файла — из acceptedTypes с сервера; свой список в
    // браузере разошёлся бы с серверным.
    await chooseRecording({ canExtract: false, acceptedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'] });

    expect(screen.getByLabelText(FIELD_LABELS.recording)).toHaveAttribute(
      'accept',
      'audio/mpeg,audio/wav,audio/ogg',
    );
  });

  it('называет предел размера до выбора файла', async () => {
    // Читать два гигабайта, чтобы потом отказать, незачем — и человек
    // обязан узнать предел прежде, чем ждать выгрузки.
    await chooseRecording();

    expect(screen.getByText(/до 2 ГБ/)).toBeInTheDocument();
  });

  it('при выключенной службе выбора записи нет, но есть объяснение', () => {
    // Предложить загрузить файл, который никуда не поедет, значит
    // предложить впустую; промолчать — заставить искать.
    renderForm({ isEnabled: false });

    expect(screen.queryByLabelText(FIELD_LABELS.recording)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(FIELD_LABELS.source)).not.toBeInTheDocument();
    expect(screen.getByText('Расшифровка записи не настроена')).toBeInTheDocument();
  });

  it('негодная подпись объясняет отказ до всякой загрузки', async () => {
    // Отказ здесь экономит не минуту ожидания, а всю загрузку: два
    // гигабайта по медленному каналу — это десятки минут.
    await chooseRecording();

    fireEvent.change(screen.getByLabelText(FIELD_LABELS.recording), {
      target: { files: [recordingFile('созвон.mp4', [0x25, 0x50, 0x44, 0x46])] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/не похоже на запись/);
  });

  it('формат вне списка установки назван списком с сервера', async () => {
    await chooseRecording({ canExtract: false, acceptedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'] });

    fireEvent.change(screen.getByLabelText(FIELD_LABELS.recording), {
      target: { files: [recordingFile()] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/MP3, WAV и OGG/);
  });

  it('отправляет паспорт и запись, но не имя файла', async () => {
    const { onSubmitRecording } = await chooseRecording();

    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Созвон по релизу');
    fireEvent.change(screen.getByLabelText(FIELD_LABELS.recording), {
      target: { files: [recordingFile('Клиент Б, разбор инцидента.mp4')] },
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Загрузить запись/ })).toBeEnabled(),
    );

    await userEvent.click(screen.getByRole('button', { name: /Загрузить запись/ }));

    expect(onSubmitRecording).toHaveBeenCalledWith(
      PROJECT.id,
      { occurredOn: expect.any(String), title: 'Созвон по релизу' },
      expect.objectContaining({ uploadType: 'video/mp4' }),
    );
    expect(document.body.textContent).not.toContain('Клиент');
  });

  it('без выбранного файла отправлять не дают', async () => {
    await chooseRecording();

    await userEvent.type(screen.getByLabelText(/Заголовок/), 'Созвон');

    expect(screen.getByRole('button', { name: /Загрузить запись/ })).toBeDisabled();
  });

  it('выбранная запись названа форматом и размером, но не именем', async () => {
    // Без подтверждения выбор ничем не отличается от его отсутствия:
    // нативное поле с именем файла спрятано, и сказать о выборе больше
    // нечему. Имени при этом нет — ни здесь, ни в отправке.
    await chooseRecording();

    fireEvent.change(screen.getByLabelText(FIELD_LABELS.recording), {
      target: { files: [recordingFile('Клиент Б, разбор инцидента.mp4')] },
    });

    expect(await screen.findByText(/Выбрано: MP4/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Клиент');
  });

  it('показывает настоящий процент загрузки', async () => {
    // Правка по сравнению с первой редакцией: неопределённый индикатор
    // годился при сорока мегабайтах, а на двух гигабайтах читается как
    // зависший экран.
    renderForm({}, { percent: 10 });

    await userEvent.selectOptions(
      screen.getByLabelText(FIELD_LABELS.source),
      SOURCE_LABELS.recording,
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
  });
});

describe('форма, открытая брошенным файлом', () => {
  /** Форма с файлом в руках: так её открывает бросок на экран. */
  function renderDropped(file: File, settings: Partial<TranscriberInfo> | null = {}) {
    const onSubmitRecording = vi.fn();

    render(
      <SummaryForm
        projects={[PROJECT]}
        onSubmit={vi.fn()}
        droppedFile={file}
        {...(settings === null
          ? {}
          : {
              recording: {
                transcriber: { ...TRANSCRIBER, ...settings },
                onSubmit: onSubmitRecording,
              },
            })}
      />,
    );

    return onSubmitRecording;
  }

  it('запись проверяется и принимается без второго выбора', async () => {
    // Проверки те же и в том же порядке: путь чтения у броска и у
    // кнопки один.
    renderDropped(recordingFile());

    expect(await screen.findByText(/Выбрано: MP4/)).toBeInTheDocument();
    expect(screen.getByLabelText(FIELD_LABELS.recording)).toBeInTheDocument();
  });

  it('негодная запись объясняет отказ, а не молчит', async () => {
    renderDropped(recordingFile('созвон.mp4', [0x25, 0x50, 0x44, 0x46]));

    expect(await screen.findByRole('alert')).toHaveTextContent(/не похоже на запись/);
  });

  it('текстовый файл едет в поле текста, а не в расшифровку', async () => {
    // `.txt` — это уже готовый текст, и отправлять его в службу
    // распознавания нечему, даже когда она настроена.
    renderDropped(fileWith('обсудили сроки', 'созвон.txt'));

    await waitFor(() =>
      expect(screen.getByLabelText(/Текст саммари/)).toHaveValue('обсудили сроки'),
    );
  });

  it('без настроенной расшифровки запись получает названный отказ', async () => {
    // Молчание заставило бы искать, чего нет: текстовый способ —
    // единственный, и он честно говорит, что принимает.
    renderDropped(recordingFile(), null);

    expect(await screen.findByRole('alert')).toHaveTextContent(/\.txt/);
  });
});
