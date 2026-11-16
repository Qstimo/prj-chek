import { StatusCheckCode, StatusWarningKind } from '@cairn/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WarningTone } from './types';
import { WarningsPanel } from './WarningsPanel';

const warnings = [
  {
    kind: StatusWarningKind.DomainExpiring,
    subject: 'example.com',
    detail: 'домен истекает 2026-09-20',
  },
  { kind: StatusWarningKind.HealthDown, subject: 'Прод', detail: 'HTTP 500' },
];

describe('WarningsPanel', () => {
  it('перечисляет предупреждения с темой и подробностью', () => {
    render(<WarningsPanel warnings={warnings} />);

    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/домен истекает 2026-09-20/)).toBeInTheDocument();
    // Точным совпадением: «Продлить регистрацию» в расшифровке — тоже «Прод».
    expect(screen.getByText('Прод')).toBeInTheDocument();
  });

  it('без предупреждений не рисует ничего', () => {
    const { container } = render(<WarningsPanel warnings={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('показывает переданный заголовок', () => {
    render(<WarningsPanel title="Не отвечает" tone={WarningTone.Critical} warnings={warnings} />);

    expect(screen.getByRole('heading', { name: 'Не отвечает' })).toBeInTheDocument();
  });

  it('делает строку ссылкой, когда адрес задан', () => {
    render(<WarningsPanel warnings={[{ ...warnings[0]!, href: '/projects/1/infrastructure' }]} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/projects/1/infrastructure');
  });

  it('оставляет строку текстом без адреса', () => {
    render(<WarningsPanel warnings={warnings} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('называет вид предупреждения, а не только фразу сервера', () => {
    // Главная жалоба: «непонятно, что это значит». Вид доезжал до веба и
    // выбрасывался, а по склеенному тексту расшифровать нечего.
    render(<WarningsPanel warnings={[warnings[1]!]} />);

    expect(screen.getByText('Адрес не отвечает')).toBeInTheDocument();
  });

  it('раскрывает, что это значит и что делать', () => {
    render(<WarningsPanel warnings={[warnings[1]!]} />);

    expect(screen.getByText('Что это значит')).toBeInTheDocument();
    expect(screen.getByText('Что делать')).toBeInTheDocument();
  });

  it('истёкший и истекающий сертификат объясняет по-разному', () => {
    const { rerender } = render(
      <WarningsPanel
        warnings={[
          { kind: StatusWarningKind.TlsExpiring, subject: 'a.example.com', detail: 'истекает' },
        ]}
      />,
    );

    expect(screen.getByText('Сертификат скоро истечёт')).toBeInTheDocument();

    rerender(
      <WarningsPanel
        warnings={[
          { kind: StatusWarningKind.TlsExpired, subject: 'a.example.com', detail: 'истёк' },
        ]}
      />,
    );

    expect(screen.getByText('Сертификат истёк')).toBeInTheDocument();
    expect(screen.queryByText('Сертификат скоро истечёт')).not.toBeInTheDocument();
  });

  it('называет, что увидела проверка, по коду', () => {
    render(
      <WarningsPanel
        warnings={[
          {
            ...warnings[1]!,
            code: StatusCheckCode.ConnectionRefused,
            detail: 'соединение отвергнуто (ECONNREFUSED)',
          },
        ]}
      />,
    );

    expect(screen.getByText('порт закрыт')).toBeInTheDocument();
  });

  it('называет срок и остаток дней', () => {
    render(
      <WarningsPanel
        warnings={[{ ...warnings[0]!, days: 5, threshold: 30, date: '2026-09-20' }]}
      />,
    );

    expect(screen.getByText('20.09.2026 — через 5 дней, предупреждаем за 30')).toBeInTheDocument();
  });

  it('прошедший срок называет просрочкой', () => {
    render(
      <WarningsPanel
        warnings={[{ ...warnings[0]!, days: -3, threshold: 30, date: '2026-09-20' }]}
      />,
    );

    expect(screen.getByText(/прошёл 3 дня назад/)).toBeInTheDocument();
  });

  it('без структурных полей срока не выдумывает', () => {
    // У расхождения привязки нет ни срока, ни порога, ни кода.
    render(
      <WarningsPanel
        warnings={[
          {
            kind: StatusWarningKind.ServerMismatch,
            subject: 'a.example.com',
            detail: 'смотрит на 203.0.113.9',
          },
        ]}
      />,
    );

    expect(screen.queryByText('Срок')).not.toBeInTheDocument();
    expect(screen.queryByText('Проверка увидела')).not.toBeInTheDocument();
  });
});
