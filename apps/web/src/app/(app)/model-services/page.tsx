import { redirect } from 'next/navigation';

/**
 * Прежний адрес экрана служб модели.
 *
 * Страница остаётся переадресацией, а не убирается: у владельца адрес в
 * закладках и в README (дизайн, 2.2). **Ручки API путь не меняют** —
 * `/model-services` у API не экран, и переносить его незачем.
 */
export default function ModelServicesPage() {
  redirect('/settings');
}
