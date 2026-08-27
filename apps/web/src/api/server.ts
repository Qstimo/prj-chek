import 'server-only';

import { cookies } from 'next/headers';

import { serverApiUrl } from './config';
import { readResponse } from './response';

/**
 * Запрос к API из серверного компонента.
 *
 * Cookie входящего запроса пробрасывается вручную: на сервере нет браузера,
 * который сделал бы это сам, и без проброса запрос уйдёт без сессии (спека 3.3).
 *
 * Это единственный допустимый способ обращения к API из серверных компонентов —
 * прямые вызовы `fetch` в них не пишем.
 */
export async function apiServer<T>(path: string): Promise<T> {
  const cookieStore = await cookies();

  const response = await fetch(`${serverApiUrl()}${path}`, {
    headers: { Cookie: cookieStore.toString() },
    // Данные о правах и проектах меняются, кэшировать их между запросами нельзя.
    cache: 'no-store',
  });

  return readResponse<T>(response);
}
