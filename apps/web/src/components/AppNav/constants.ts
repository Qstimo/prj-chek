/**
 * Пункты меню, доступные всем.
 *
 * «Саммари» идёт здесь, а не в `ADMIN_LINKS`: поток нужен не
 * администратору, а тому, кто ведёт проект. Прятать пункт по выдачам
 * значило бы считать права при отрисовке навигации, а пустой экран
 * ничего не раскрывает.
 */
export const COMMON_LINKS = [
  { href: '/', label: 'Проекты' },
  { href: '/summaries', label: 'Саммари' },
] as const;

/** Пункты меню суперадмина. */
export const ADMIN_LINKS = [
  { href: '/servers', label: 'Серверы' },
  { href: '/domains', label: 'Домены' },
  { href: '/users', label: 'Пользователи' },
  { href: '/audit', label: 'Журнал' },
] as const;
