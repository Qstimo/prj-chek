/** Пункты меню, доступные всем. */
export const COMMON_LINKS = [{ href: '/', label: 'Проекты' }] as const;

/** Пункты меню суперадмина. */
export const ADMIN_LINKS = [
  { href: '/servers', label: 'Серверы' },
  { href: '/domains', label: 'Домены' },
  { href: '/users', label: 'Пользователи' },
  { href: '/audit', label: 'Журнал' },
] as const;
