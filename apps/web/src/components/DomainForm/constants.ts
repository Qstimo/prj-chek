/** Подписи полей формы корневого домена. */
export const FIELD_LABELS = {
  name: 'Домен',
  owner: 'Владелец',
  registrar: 'Регистратор',
  paidUntil: 'Оплачен до',
  notes: 'Заметки',
} as const;

/** Подсказка к имени: реестр ведёт корни, а не адреса стендов. */
export const NAME_HINT = 'Корневой домен, за который платят: example.com';
