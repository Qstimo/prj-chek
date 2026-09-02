import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted) / var(--muted-alpha))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        surface: 'hsl(var(--surface) / var(--surface-alpha))',
        'surface-strong': 'hsl(var(--surface) / var(--surface-strong-alpha))',
        border: 'hsl(var(--border) / var(--border-alpha))',
        'border-strong': 'hsl(var(--border) / var(--border-strong-alpha))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        'accent-soft': 'hsl(var(--accent-soft) / 0.22)',
        'accent-soft-foreground': 'hsl(var(--accent-soft))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
      },
      // Голый класс `border` без цвета используется в ~25 местах (кнопки
      // «Раскрыть», «Скопировать» и т. п.) — без этого DEFAULT остался бы
      // светло-серым gray.200 из preflight и в тёмной теме резал бы глаз.
      borderColor: {
        DEFAULT: 'hsl(var(--border) / var(--border-alpha))',
      },
      borderRadius: {
        md: 'var(--radius-control)',
        lg: 'var(--radius-card)',
      },
      boxShadow: {
        // Единственная тень темы: мягкая, нейтральная (спека, раздел 3 — без ореолов).
        surface: '0 8px 24px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
