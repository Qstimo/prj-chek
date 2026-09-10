/** Подписи полей формы сервера. */
export const FIELD_LABELS = {
  name: 'Название',
  owner: 'Владелец',
  host: 'Хост',
  ip: 'IP-адрес',
  provider: 'Провайдер',
  specs: 'Характеристики',
  paidUntil: 'Оплачен до',
  notes: 'Заметки',
} as const;

/** Поля, вводимые одной строкой, в порядке отображения. */
export const TEXT_FIELDS = ['owner', 'host', 'ip', 'provider', 'specs'] as const;
