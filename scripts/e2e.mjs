/**
 * Сквозная проверка развёрнутой системы.
 *
 * В отличие от тестов рабочих пространств, которые проверяют единицы кода,
 * этот скрипт проходит путь продукта целиком по живому развёртыванию: через
 * тот же реверс-прокси и те же адреса, что и браузер. Он ничего не подменяет
 * и не заглушает — только ходит по HTTP и сверяет ответы.
 *
 * Запуск описан в README, раздел «Сквозная проверка».
 */
import { authenticator } from 'otplib';

/** Адрес развёрнутой системы. */
const BASE = process.env.CAIRN_BASE_URL ?? 'https://localhost';

/** Ссылка приглашения суперадмина: выдаётся командой `create-superadmin`. */
const ADMIN_INVITE = process.argv[2] ?? process.env.CAIRN_INVITE_URL;

/**
 * Отключение проверки сертификата.
 *
 * Нужно только для локального Caddy: на `localhost` он выпускает сертификат
 * собственным центром, которого нет в доверенных. Против настоящего домена
 * переменную задавать нельзя — проверка сертификата и есть часть проверки.
 */
if (process.env.CAIRN_INSECURE_TLS === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

/** Учётные данные, заводимые проверкой. */
const ADMIN = { email: 'admin@example.com', password: 'Очень длинный пароль администратора 1' };
const GUEST = { email: 'guest@example.com', password: 'Очень длинный пароль гостя 1' };

/** Проект, на котором проверяются уровни доступа. */
const PROJECT = {
  name: 'Первый проект',
  purpose: 'Секретное назначение',
  stack: 'Next.js, NestJS',
  repoUrl: 'https://example.com/repo',
  notes: 'Внутренние заметки',
  lifecycle: 'active',
};

/** Заведомо отсутствующий проект: обращение к нему должно давать «не найдено». */
const MISSING_PROJECT_ID = '11111111-1111-1111-1111-111111111111';

const results = [];

/** Записывает результат проверки и печатает его строкой. */
function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);

  return ok;
}

/**
 * Проверка, без которой остальные бессмысленны.
 *
 * Продолжать после неё нельзя: дальнейшие шаги опираются на её результат
 * и упали бы с невнятной ошибкой вместо понятного отчёта.
 */
function checkCritical(name, condition, detail = '') {
  if (!check(name, condition, detail)) {
    report();
    process.exit(1);
  }
}

/**
 * Клиент с собственной cookie — отдельный «браузер».
 *
 * Переадресации не выполняются: их коды и адреса сами по себе предмет
 * проверки (например, что без второго фактора любая страница ведёт на
 * привязку).
 */
function makeAgent() {
  let cookie = '';

  return async function request(path, options = {}) {
    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      redirect: 'manual',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');

      if (pair?.startsWith('cairn_session=')) {
        cookie = pair;
      }
    }

    const text = await response.text();

    return { status: response.status, json: parseJson(text), text, headers: response.headers };
  };
}

/** Разбирает тело ответа, если это JSON. */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Достаёт токен из ссылки приглашения. */
function tokenOf(url) {
  return url.split('/invite/')[1];
}

/**
 * Путь суперадмина: пароль по ссылке, второй фактор, проект, приглашение,
 * выдача доступа, повторный вход и журнал.
 */
async function runAdminScenario(admin) {
  const token = tokenOf(ADMIN_INVITE);

  const link = await admin(`/api/invitations/${token}`);
  checkCritical('ссылка приглашения действительна', link.status === 200, `статус ${link.status}`);

  const invitePage = await admin(`/invite/${token}`);
  check('страница установки пароля отдаётся', invitePage.status === 200, `статус ${invitePage.status}`);

  const accepted = await admin(`/api/invitations/${token}/accept`, {
    method: 'POST',
    body: { password: ADMIN.password },
  });
  checkCritical('пароль задан и выдана сессия', accepted.json?.kind === 'session', JSON.stringify(accepted.json));

  const beforeTotp = await admin('/api/auth/me');
  check('второй фактор ещё не привязан', beforeTotp.json?.isTotpEnabled === false);

  const homeBeforeTotp = await admin('/');
  check(
    'без второго фактора сводка ведёт на /security',
    homeBeforeTotp.status === 307 && homeBeforeTotp.headers.get('location')?.includes('/security'),
    `статус ${homeBeforeTotp.status}, location ${homeBeforeTotp.headers.get('location')}`,
  );

  const securityPage = await admin('/security');
  check('страница привязки открывается', securityPage.status === 200, `статус ${securityPage.status}`);

  const setup = await admin('/api/auth/totp/setup', { method: 'POST' });
  checkCritical(
    'выдан секрет второго фактора',
    typeof setup.json?.secret === 'string' && setup.json.keyUri?.startsWith('otpauth://totp/'),
    `статус ${setup.status}`,
  );

  const wrongCode = await admin('/api/auth/totp/confirm', { method: 'POST', body: { code: '000000' } });
  check('неверный код не включает фактор', wrongCode.status === 401, `статус ${wrongCode.status}`);

  const confirmed = await admin('/api/auth/totp/confirm', {
    method: 'POST',
    body: { code: authenticator.generate(setup.json.secret) },
  });
  checkCritical('верный код включает фактор', confirmed.status === 204, `статус ${confirmed.status}`);

  const afterTotp = await admin('/api/auth/me');
  check('второй фактор привязан', afterTotp.json?.isTotpEnabled === true);

  const home = await admin('/');
  check('после привязки сводка открывается', home.status === 200, `статус ${home.status}`);
  check('сводка предлагает создать проект', home.text.includes('Создать проект'));

  const created = await admin('/api/projects', { method: 'POST', body: PROJECT });
  checkCritical('проект создан', created.status === 201, `статус ${created.status} ${created.text.slice(0, 120)}`);

  const invited = await admin('/api/invitations', { method: 'POST', body: { email: GUEST.email } });
  checkCritical('приглашение выдано ссылкой', typeof invited.json?.url === 'string', invited.text.slice(0, 120));

  const users = await admin('/api/users');
  const guestUser = users.json?.find((user) => user.email === GUEST.email);
  checkCritical('приглашённый виден в списке пользователей', Boolean(guestUser));

  const grant = await admin(`/api/projects/${created.json.id}/grants`, {
    method: 'PUT',
    body: { subjectId: guestUser.subjectId, section: 'info', level: 'metadata' },
  });
  checkCritical(
    'выдан уровень «метаданные» на «Инфо»',
    grant.status === 200,
    `статус ${grant.status} ${grant.text.slice(0, 120)}`,
  );

  const infraGrant = await admin(`/api/projects/${created.json.id}/grants`, {
    method: 'PUT',
    body: { subjectId: guestUser.subjectId, section: 'infrastructure', level: 'metadata' },
  });
  checkCritical(
    'выдан уровень «метаданные» на «Инфраструктуру»',
    infraGrant.status === 200,
    `статус ${infraGrant.status}`,
  );

  const environment = await admin(`/api/projects/${created.json.id}/environments`, {
    method: 'POST',
    body: {
      name: 'Прод',
      kind: 'production',
      ip: '203.0.113.10',
      provider: 'Hetzner',
      domains: ['example.com'],
      // Изнутри compose соседний контейнер доступен по имени сервиса:
      // живой адрес для настоящей health-проверки.
      healthCheckUrl: 'http://web:3000/login',
    },
  });
  check(
    'окружение создано',
    environment.status === 201,
    `статус ${environment.status} ${environment.text.slice(0, 120)}`,
  );

  const variablesGrant = await admin(`/api/projects/${created.json.id}/grants`, {
    method: 'PUT',
    body: { subjectId: guestUser.subjectId, section: 'variables', level: 'metadata' },
  });
  checkCritical(
    'выдан уровень «метаданные» на «Переменные»',
    variablesGrant.status === 200,
    `статус ${variablesGrant.status}`,
  );

  const variable = await admin(
    `/api/projects/${created.json.id}/environments/${environment.json.id}/variables`,
    {
      method: 'POST',
      body: { key: 'DATABASE_URL', value: 'postgres://very-secret', description: 'Подключение' },
    },
  );
  checkCritical('переменная создана', variable.status === 201, `статус ${variable.status}`);
  check(
    'ответ создания не содержит значения',
    !variable.text.includes('very-secret'),
    variable.text.slice(0, 120),
  );

  const revealed = await admin(
    `/api/projects/${created.json.id}/environments/${environment.json.id}/variables/${variable.json.id}/reveal`,
    { method: 'POST' },
  );
  check(
    'раскрытие возвращает значение',
    revealed.json?.value === 'postgres://very-secret',
    `статус ${revealed.status}`,
  );

  const envText = await admin(
    `/api/projects/${created.json.id}/environments/${environment.json.id}/variables/export`,
  );
  check(
    'выгрузка env содержит ключ',
    envText.text.includes('DATABASE_URL='),
    envText.text.slice(0, 80),
  );

  const checksRun = await admin('/api/status/run', { method: 'POST' });
  check('проверки статуса запущены', checksRun.status === 202, `статус ${checksRun.status}`);

  const projectStatus = await admin(`/api/projects/${created.json.id}/status`);
  check(
    'окружение прошло health-проверку',
    projectStatus.json?.environments?.[0]?.health === 'up',
    JSON.stringify(projectStatus.json?.environments?.[0]),
  );
  check(
    'индикатор проекта вычислен',
    projectStatus.json?.indicator && projectStatus.json.indicator !== 'unknown',
    `индикатор ${projectStatus.json?.indicator}`,
  );

  const summary = await admin('/api/status/summary');
  check(
    'сводка статусов содержит проект',
    summary.json?.some((row) => row.projectId === created.json.id),
    `строк ${summary.json?.length}`,
  );

  const roadmapGrant = await admin(`/api/projects/${created.json.id}/grants`, {
    method: 'PUT',
    body: { subjectId: guestUser.subjectId, section: 'roadmap', level: 'metadata' },
  });
  checkCritical(
    'выдан уровень «метаданные» на «Роадмап»',
    roadmapGrant.status === 200,
    `статус ${roadmapGrant.status}`,
  );

  const version = await admin(`/api/projects/${created.json.id}/roadmap/versions`, {
    method: 'POST',
    body: { label: 'v1.0', state: 'in_progress' },
  });
  checkCritical('версия роадмапа создана', version.status === 201, `статус ${version.status}`);

  const firstCheckpoint = await admin(
    `/api/projects/${created.json.id}/roadmap/versions/${version.json.id}/checkpoints`,
    { method: 'POST', body: { title: 'Секретная формулировка чекпоинта' } },
  );
  await admin(
    `/api/projects/${created.json.id}/roadmap/versions/${version.json.id}/checkpoints`,
    { method: 'POST', body: { title: 'Второй пункт' } },
  );
  await admin(
    `/api/projects/${created.json.id}/roadmap/versions/${version.json.id}/checkpoints/${firstCheckpoint.json.id}`,
    { method: 'PATCH', body: { isDone: true } },
  );

  const roadmap = await admin(`/api/projects/${created.json.id}/roadmap`);
  check(
    'прогресс версии вычислен как 1/2',
    roadmap.json?.versions?.[0]?.progress?.done === 1 &&
      roadmap.json?.versions?.[0]?.progress?.total === 2,
    JSON.stringify(roadmap.json?.versions?.[0]?.progress),
  );

  const published = await admin(`/api/projects/${created.json.id}/roadmap/public-link`, {
    method: 'POST',
  });
  checkCritical('роадмап опубликован', published.status === 201, `статус ${published.status}`);

  const chronicleGrant = await admin(`/api/projects/${created.json.id}/grants`, {
    method: 'PUT',
    body: { subjectId: guestUser.subjectId, section: 'chronicle', level: 'metadata' },
  });
  checkCritical(
    'выдан уровень «метаданные» на «Хронику»',
    chronicleGrant.status === 200,
    `статус ${chronicleGrant.status}`,
  );

  const intake = await admin(`/api/projects/${created.json.id}/intake-address`, {
    method: 'POST',
  });
  checkCritical('приёмный адрес создан', intake.status === 201, `статус ${intake.status}`);

  // Отправка идёт отдельным «машинным» клиентом без cookie:
  // канал обязан работать без сессии (спека 5.1).
  const machine = makeAgent();
  const inbound = await machine(`/api/intake/${intake.json.token}`, {
    method: 'POST',
    body: { title: 'Сводка встречи', content: 'Решили выпускать в пятницу.' },
  });
  check('входящее принято без сессии', inbound.status === 201, `статус ${inbound.status}`);

  const feed = await admin(`/api/projects/${created.json.id}/chronicle`);
  check(
    'входящее видно в хронике с источником webhook',
    feed.json?.some((entry) => entry.title === 'Сводка встречи' && entry.source === 'webhook'),
    JSON.stringify(feed.json).slice(0, 160),
  );

  await runLoginScenario(admin, setup.json.secret);
  await runAuditScenario(admin);

  return {
    projectId: created.json.id,
    guestUser,
    guestInviteUrl: invited.json.url,
    intakeToken: intake.json.token,
    environmentId: environment.json.id,
    variableId: variable.json.id,
    roadmapToken: published.json.token,
  };
}

/** Полный вход по паролю: выход, отказ на неверном пароле, челлендж второго фактора. */
async function runLoginScenario(admin, secret) {
  const loggedOut = await admin('/api/auth/logout', { method: 'POST' });
  check('выход выполнен', loggedOut.status === 204, `статус ${loggedOut.status}`);

  const afterLogout = await admin('/api/auth/me');
  check('после выхода сессия недействительна', afterLogout.status === 401, `статус ${afterLogout.status}`);

  const wrongPassword = await admin('/api/auth/login', {
    method: 'POST',
    body: { email: ADMIN.email, password: 'неверный пароль' },
  });
  check('неверный пароль отклонён', wrongPassword.status === 401, `статус ${wrongPassword.status}`);

  const loggedIn = await admin('/api/auth/login', {
    method: 'POST',
    body: { email: ADMIN.email, password: ADMIN.password },
  });
  checkCritical(
    'вход по паролю требует второй фактор',
    loggedIn.json?.kind === 'totp_required',
    JSON.stringify(loggedIn.json),
  );

  const verified = await admin('/api/auth/totp', {
    method: 'POST',
    body: { challengeToken: loggedIn.json.challengeToken, code: authenticator.generate(secret) },
  });
  checkCritical('код второго фактора выдаёт сессию', verified.json?.kind === 'session', JSON.stringify(verified.json));
}

/** Журнал: каждое пройденное действие должно быть в нём (спека 7). */
async function runAuditScenario(admin) {
  const audit = await admin('/api/audit');
  const entries = audit.json?.entries ?? audit.json ?? [];
  const actions = new Set(entries.map((entry) => entry.action));

  check('журнал содержит вход', actions.has('login.succeeded'), [...actions].join(', '));
  check('журнал содержит неудачный вход', actions.has('login.failed'));
  check('журнал содержит включение второго фактора', actions.has('totp.enabled'));
  check('журнал содержит создание проекта', actions.has('project.created'));
  check('журнал содержит выдачу доступа', actions.has('grant.created'));
  check('журнал содержит приглашение', actions.has('invitation.created'));
  check('журнал содержит создание суперадмина с консоли', actions.has('superadmin.created'));
  check('журнал содержит раскрытие переменной', actions.has('variable.revealed'));
  check('журнал содержит выгрузку переменных', actions.has('variables.exported'));
  check(
    'журнал не содержит значения переменной',
    !JSON.stringify(entries).includes('very-secret'),
  );

  const auditPage = await admin('/audit');
  check(
    'экран журнала показывает записи',
    auditPage.status === 200 && auditPage.text.includes('project.created'),
    `статус ${auditPage.status}`,
  );
}

/**
 * Путь приглашённого: уровень «метаданные» на одну секцию.
 *
 * Проверяется не только то, что доступно, но и то, что отсутствие доступа
 * выглядит как «не найдено», а не как «запрещено» (спека 4.1).
 */
async function runGuestScenario(guest, { projectId, guestInviteUrl, environmentId, variableId }) {
  const accepted = await guest(`/api/invitations/${tokenOf(guestInviteUrl)}/accept`, {
    method: 'POST',
    body: { password: GUEST.password },
  });
  checkCritical('приглашённый задал пароль', accepted.json?.kind === 'session', JSON.stringify(accepted.json));

  const projects = await guest('/api/projects');
  check('приглашённому виден один проект', projects.json?.length === 1, JSON.stringify(projects.json));
  check(
    'на уровне «метаданные» видно только название и состояние',
    projects.json?.[0] && !('purpose' in projects.json[0]) && !('notes' in projects.json[0]),
    JSON.stringify(projects.json?.[0]),
  );

  const project = await guest(`/api/projects/${projectId}`);
  check(
    'карточка не раскрывает назначение и заметки',
    project.status === 200 &&
      !project.text.includes(PROJECT.purpose) &&
      !project.text.includes(PROJECT.notes),
    `статус ${project.status}`,
  );

  const environments = await guest(`/api/projects/${projectId}/environments`);
  check(
    'приглашённому видно окружение',
    environments.json?.length === 1,
    JSON.stringify(environments.json),
  );
  check(
    'на уровне «метаданные» виден домен, но не IP',
    environments.json?.[0]?.domains?.includes('example.com') &&
      environments.json?.[0]?.ip === undefined,
    JSON.stringify(environments.json?.[0]),
  );

  const environmentWrite = await guest(`/api/projects/${projectId}/environments`, {
    method: 'POST',
    body: { name: 'Стейдж', kind: 'staging' },
  });
  check(
    'правка инфраструктуры отклонена',
    environmentWrite.status === 403,
    `статус ${environmentWrite.status}`,
  );

  const guestFeed = await guest(`/api/projects/${projectId}/chronicle`);
  check(
    'приглашённому видна лента хроники',
    guestFeed.status === 200 && guestFeed.json?.length === 1,
    `статус ${guestFeed.status}`,
  );
  check(
    'на уровне «метаданные» виден заголовок, но не содержимое',
    guestFeed.json?.[0]?.title === 'Сводка встречи' && guestFeed.json?.[0]?.content === undefined,
    JSON.stringify(guestFeed.json?.[0]),
  );

  const guestVariables = await guest(
    `/api/projects/${projectId}/environments/${environmentId}/variables`,
  );
  check(
    'приглашённому виден ключ переменной без значения',
    guestVariables.json?.[0]?.key === 'DATABASE_URL' &&
      !guestVariables.text.includes('very-secret'),
    guestVariables.text.slice(0, 120),
  );

  const guestReveal = await guest(
    `/api/projects/${projectId}/environments/${environmentId}/variables/${variableId}/reveal`,
    { method: 'POST' },
  );
  check(
    'раскрытие на уровне «метаданные» отклонено',
    guestReveal.status === 403,
    `статус ${guestReveal.status}`,
  );

  const guestStatus = await guest(`/api/projects/${projectId}/status`);
  check(
    'приглашённому со статусом инфраструктуры виден индикатор',
    guestStatus.status === 200 && guestStatus.json?.indicator,
    `статус ${guestStatus.status}, индикатор ${guestStatus.json?.indicator}`,
  );

  const guestRunChecks = await guest('/api/status/run', { method: 'POST' });
  check(
    'запуск проверок приглашённому недоступен',
    guestRunChecks.status === 403,
    `статус ${guestRunChecks.status}`,
  );

  const guestRoadmap = await guest(`/api/projects/${projectId}/roadmap`);
  check(
    'приглашённому виден прогресс роадмапа без формулировок',
    guestRoadmap.json?.versions?.[0]?.progress?.done === 1 &&
      !guestRoadmap.text.includes('Секретная формулировка'),
    guestRoadmap.text.slice(0, 120),
  );

  const guestAddress = await guest(`/api/projects/${projectId}/intake-address`);
  check(
    'приёмный адрес не показывается без права записи',
    guestAddress.status === 403,
    `статус ${guestAddress.status}`,
  );

  const home = await guest('/');
  check('в меню приглашённого нет «Пользователи»', !home.text.includes('>Пользователи<'), `статус ${home.status}`);
  check('в меню приглашённого нет «Журнал»', !home.text.includes('>Журнал<'));

  const users = await guest('/api/users');
  check('прямое обращение к пользователям отклонено', users.status === 403, `статус ${users.status}`);

  const audit = await guest('/api/audit');
  check('прямое обращение к журналу отклонено', audit.status === 403, `статус ${audit.status}`);

  const missing = await guest(`/api/projects/${MISSING_PROJECT_ID}`);
  check('несуществующий проект — «не найдено»', missing.status === 404, `статус ${missing.status}`);
}

/** Публичный роадмап: чтение без сессии, гашение после отключения. */
async function runPublicRoadmapScenario(admin, { projectId, roadmapToken }) {
  const machine = makeAgent();

  const publicApi = await machine(`/api/public/roadmap/${roadmapToken}`);
  check(
    'публичный роадмап читается без сессии с формулировками',
    publicApi.status === 200 && publicApi.text.includes('Секретная формулировка'),
    `статус ${publicApi.status}`,
  );

  const publicPage = await machine(`/roadmap/${roadmapToken}`);
  check('публичная страница отдаётся', publicPage.status === 200, `статус ${publicPage.status}`);

  const unpublished = await admin(`/api/projects/${projectId}/roadmap/public-link`, {
    method: 'DELETE',
  });
  check('публикация отключена', unpublished.status === 204, `статус ${unpublished.status}`);

  const gone = await machine(`/api/public/roadmap/${roadmapToken}`);
  check('после отключения прежний токен получает 404', gone.status === 404, `статус ${gone.status}`);
}

/** Отзыв приёмного адреса: прежний токен обязан погаснуть. */
async function runIntakeRevocationScenario(admin, { projectId, intakeToken }) {
  const revoked = await admin(`/api/projects/${projectId}/intake-address`, { method: 'DELETE' });
  check('приёмный адрес отозван', revoked.status === 204, `статус ${revoked.status}`);

  const machine = makeAgent();
  const rejected = await machine(`/api/intake/${intakeToken}`, {
    method: 'POST',
    body: { content: 'Опоздавшая сводка' },
  });
  check('после отзыва прежний токен получает 404', rejected.status === 404, `статус ${rejected.status}`);
}

/** Отзыв субъекта: действующая сессия должна перестать работать сразу. */
async function runRevocationScenario(admin, guest, { guestUser }) {
  const revoked = await admin(`/api/users/${guestUser.id}/revoke`, { method: 'POST' });
  check('доступ приглашённого отозван', revoked.status === 204, `статус ${revoked.status}`);

  const me = await guest('/api/auth/me');
  check('после отзыва сессия недействительна', me.status === 401, `статус ${me.status}`);

  const page = await guest('/');
  check(
    'после отзыва страница ведёт на вход',
    page.status === 307 && page.headers.get('location')?.includes('/login'),
    `статус ${page.status}, location ${page.headers.get('location')}`,
  );
}

/** Печатает итог и возвращает число провалов. */
function report() {
  const failed = results.filter((result) => !result.ok);
  console.log(`\nПройдено ${results.length - failed.length} из ${results.length}`);

  return failed.length;
}

if (!ADMIN_INVITE) {
  console.error(
    'Передай ссылку приглашения суперадмина аргументом или в CAIRN_INVITE_URL.\n' +
      'Ссылку выдаёт: docker compose run --rm api node dist/cli/main.js create-superadmin admin@example.com',
  );
  process.exit(2);
}

const admin = makeAgent();
const guest = makeAgent();

const context = await runAdminScenario(admin);
await runGuestScenario(guest, context);
await runPublicRoadmapScenario(admin, context);
await runIntakeRevocationScenario(admin, context);
await runRevocationScenario(admin, guest, context);

process.exit(report() === 0 ? 0 : 1);
