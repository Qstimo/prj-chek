import { ModelServicesScreen } from './ModelServicesScreen';

/**
 * Страница настроек установки. Закрыта правом суперадмина на API — тем же
 * способом, которым закрыты «Серверы» и «Домены».
 *
 * Блок у настроек свой заголовок, хотя блок пока один: страница заведена
 * как место для настроек, а не как обёртка служб модели, и следующая
 * настройка поедет сюда, а не восьмым пунктом в полосу навигации
 * (дизайн, 5.1).
 */
export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Настройки</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Службы модели</h2>
        <ModelServicesScreen />
      </section>
    </main>
  );
}
