import { StatusCheckCode, StatusWarningKind } from '@cairn/shared';

import { WarningTone, type WarningGuide } from './types';

/** Заголовок блока, когда свой не задан. */
export const DEFAULT_TITLE = 'Предупреждения';

/**
 * Оформление по срочности.
 *
 * Классы записаны целиком, а не собираются из кусков: Tailwind вырезает
 * классы, которых нет в исходниках буквально.
 */
export const TONE_STYLES: Record<WarningTone, string> = {
  [WarningTone.Critical]: 'border-destructive/50 bg-destructive/10',
  [WarningTone.Attention]: 'border-amber-500/50 bg-amber-500/10',
};

/**
 * Расшифровка предупреждений: что произошло, что это значит, что делать.
 *
 * Вид предупреждения доезжал до веба и выбрасывался — на экране оставалось
 * «subject: detail», и жалоба владельца («непонятно, что это значит»)
 * ровно про это. Фраза с сервера отвечает на вопрос «что увидели», а
 * здесь — «чем это грозит» и «чьё это действие».
 *
 * `Record` без `?`: новый вид предупреждения обязан получить расшифровку,
 * иначе сборка упадёт — то же правило, что у подписей индикатора.
 */
export const WARNING_GUIDE: Record<StatusWarningKind, WarningGuide> = {
  [StatusWarningKind.HealthDown]: {
    title: 'Адрес не отвечает',
    meaning:
      'Проверка получила ошибку сервера или не смогла соединиться. Снаружи адрес недоступен.',
    action: 'Поднять приложение на машине окружения; причину отказа подскажет код проверки.',
  },
  [StatusWarningKind.HealthCheckMisconfigured]: {
    title: 'Ручка проверки отвечает не тем',
    meaning:
      'Адрес жив, но путь проверки ведёт в пустоту или отказывает запросу. Это настройка проверки, а не падение: инцидент не открывается и уведомление не уходит.',
    action: 'Поправить «Путь проверки» у окружения — обычно это /api/health.',
  },
  [StatusWarningKind.TlsExpiring]: {
    title: 'Сертификат скоро истечёт',
    meaning: 'Сертификату пока доверяют, но срок на исходе. После срока браузеры закроют доступ.',
    action: 'Продлить сертификат или проверить, что автопродление работает.',
  },
  [StatusWarningKind.TlsExpired]: {
    title: 'Сертификат истёк',
    meaning: 'Браузеры уже показывают предупреждение и не пускают на адрес.',
    action: 'Выпустить сертификат заново сегодня.',
  },
  [StatusWarningKind.TlsInvalid]: {
    title: 'Сертификату нельзя верить',
    meaning:
      'Сертификат получен, но доверия не вызывает: самоподписанный, цепочка не проверяется либо выписан на другое имя. Срок при этом может быть далёким — он ничего не значит, пока доверия нет.',
    action: 'Выпустить сертификат на это имя у известного удостоверяющего центра.',
  },
  [StatusWarningKind.TlsError]: {
    title: 'Сертификат не проверить',
    meaning:
      'Рукопожатия не было вовсе: о сертификате не известно ни срока, ни доверия. Обычно порт закрыт или отвечает не по TLS.',
    action: 'Проверить, что адрес слушает 443 и отдаёт TLS.',
  },
  [StatusWarningKind.DomainExpiring]: {
    title: 'Регистрация домена заканчивается',
    meaning:
      'Так говорит реестр зоны. После срока имя освобождается, и его могут занять в тот же день.',
    action: 'Продлить регистрацию у регистратора.',
  },
  [StatusWarningKind.ServerExpiring]: {
    title: 'Срок оплаты машины',
    meaning:
      'Машина оплачена до названного дня. Неоплаченная машина продолжает работать недолго и выключается без предупреждения.',
    action: 'Оплатить у провайдера и поправить срок в реестре серверов.',
  },
  [StatusWarningKind.DomainRenewalExpiring]: {
    title: 'Срок продления корневого домена',
    meaning:
      'Это наша оплата из реестра доменов, а не ответ реестра зоны: в зонах без RDAP другого источника нет.',
    action: 'Продлить домен и поправить срок в реестре доменов.',
  },
  [StatusWarningKind.ServerMismatch]: {
    title: 'Адрес смотрит не на ту машину',
    meaning:
      'Имя разрешается в адрес, которого нет у машины окружения. Так выглядят переезд, опечатка в DNS и угнанная запись — система говорит, но привязку не трогает.',
    action: 'Сверить запись в DNS с машиной окружения; верное — оставить, лишнее — убрать.',
  },
  [StatusWarningKind.AddressesDisagree]: {
    title: 'Адреса окружения смотрят на разные машины',
    meaning:
      'Поэтому машина окружением и не определилась: система не выбирает за человека, на какой из машин окружение живёт.',
    action: 'Свести имена к одной машине либо привязать машину к окружению вручную.',
  },
};

/**
 * Что именно увидела проверка — короткой фразой.
 *
 * Уточнение к виду предупреждения: вид говорит «адрес не отвечает», код —
 * закрыт ли порт, не разрешается ли имя или сервер ответил своей ошибкой.
 * Лечение у этих случаев разное.
 *
 * `Record` без `?`: новый код проверки обязан получить фразу — то же
 * правило, что у `PHRASES` на стороне API.
 */
export const CODE_LABELS: Record<StatusCheckCode, string> = {
  [StatusCheckCode.Redirect]: 'перенаправление на другой адрес',
  [StatusCheckCode.AuthRequired]: 'закрыто авторизацией',
  [StatusCheckCode.MethodNotAllowed]: 'метод запроса не разрешён',
  [StatusCheckCode.PathNotFound]: 'путь проверки не найден',
  [StatusCheckCode.ClientError]: 'адрес отказал запросу',
  [StatusCheckCode.ServerError]: 'сервер ответил своей ошибкой',
  [StatusCheckCode.Timeout]: 'ответа не дождались',
  [StatusCheckCode.ConnectionRefused]: 'порт закрыт',
  [StatusCheckCode.ConnectionReset]: 'соединение разорвано на полуслове',
  [StatusCheckCode.Unreachable]: 'сети до адреса нет',
  [StatusCheckCode.ProtocolError]: 'порт отвечает не по тому протоколу',
  [StatusCheckCode.DnsNotFound]: 'имени нет в DNS',
  [StatusCheckCode.DnsNoRecord]: 'имя есть, адресной записи нет',
  [StatusCheckCode.DnsTemporary]: 'DNS не ответил сейчас',
  [StatusCheckCode.CertificateUntrusted]: 'сертификат не вызывает доверия',
  [StatusCheckCode.CertificateExpired]: 'сертификат истёк',
  [StatusCheckCode.CertificateNameMismatch]: 'сертификат выписан на другое имя',
  [StatusCheckCode.CertificateMissing]: 'срока в сертификате нет',
  [StatusCheckCode.RegistryNotFound]: 'реестр зоны не знает этого домена',
  [StatusCheckCode.RegistryNoExpiration]: 'реестр зоны не сообщил срока',
  [StatusCheckCode.RegistryUnavailable]: 'реестр зоны недоступен',
  [StatusCheckCode.Unknown]: 'причина не разобрана',
};

/** Подписи строк расшифровки. */
export const GUIDE_LABELS = {
  meaning: 'Что это значит',
  action: 'Что делать',
  code: 'Проверка увидела',
  deadline: 'Срок',
} as const;
