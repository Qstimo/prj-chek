import { LoginScreen } from './LoginScreen';

/** Страница входа. Свечение по центру — акцент единственного экрана без данных. */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center px-4 [background:radial-gradient(ellipse_60%_40%_at_50%_45%,hsl(var(--glow)/0.14),transparent)]">
      <div className="w-full rounded-lg border border-border bg-surface p-6 shadow-surface backdrop-blur-md">
        <LoginScreen />
      </div>
    </main>
  );
}
