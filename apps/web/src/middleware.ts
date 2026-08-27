import { NextResponse, type NextRequest } from 'next/server';

/**
 * Прокидывает путь запроса в заголовок.
 *
 * Серверные разметки не знают текущего адреса, а он нужен, чтобы
 * не зациклить переадресацию на страницу привязки второго фактора.
 */
export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);

  return NextResponse.next({ request: { headers } });
}

/** Посредник не нужен на статике и служебных путях Next.js. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
