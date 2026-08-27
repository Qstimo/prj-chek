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

  await runLoginScenario(admin, setup.json.secret);
  await runAuditScenario(admin);

  return { projectId: created.json.id, guestUser, guestInviteUrl: invited.json.url };
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
async function runGuestScenario(guest, { projectId, guestInviteUrl }) {
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
await runRevocationScenario(admin, guest, context);

process.exit(report() === 0 ? 0 : 1);
