import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PushToggle } from './PushToggle';

describe('кнопка уведомлений', () => {
  it('без ключа на сервере не рисует ничего', () => {
    // Ключи не заданы — отправлять нечем, и кнопка солгала бы.
    const { container } = render(
      <PushToggle publicKey={null} permission="default" isSubscribed={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('без поддержки в браузере не рисует ничего', () => {
    const { container } = render(
      <PushToggle publicKey="к" permission="default" isSubscribed={false} isSupported={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('предлагает включить, когда разрешение не спрашивали', () => {
    render(<PushToggle publicKey="к" permission="default" isSubscribed={false} />);

    expect(screen.getByRole('button')).toHaveTextContent('Уведомлять на этом устройстве');
  });

  it('предлагает выключить, когда подписка есть', () => {
    render(<PushToggle publicKey="к" permission="granted" isSubscribed />);

    expect(screen.getByRole('button')).toHaveTextContent('выключить');
  });

  it('при запрете объясняет, а не предлагает повтор', () => {
    // Отказ браузер помнит намертво: кнопка, которая ничего не делает,
    // хуже её отсутствия.
    render(<PushToggle publicKey="к" permission="denied" isSubscribed={false} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/настройках браузера/)).toBeInTheDocument();
  });

  it('нажатие зовёт подписку', async () => {
    const onSubscribe = vi.fn();

    render(
      <PushToggle
        publicKey="к"
        permission="default"
        isSubscribed={false}
        onSubscribe={onSubscribe}
      />,
    );
    await userEvent.click(screen.getByRole('button'));

    expect(onSubscribe).toHaveBeenCalled();
  });

  it('нажатие при включённых зовёт отписку', async () => {
    const onUnsubscribe = vi.fn();

    render(
      <PushToggle
        publicKey="к"
        permission="granted"
        isSubscribed
        onUnsubscribe={onUnsubscribe}
      />,
    );
    await userEvent.click(screen.getByRole('button'));

    expect(onUnsubscribe).toHaveBeenCalled();
  });

  it('пока запрос в пути, кнопка не нажимается повторно', () => {
    render(
      <PushToggle publicKey="к" permission="default" isSubscribed={false} isBusy />,
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });
  it('показывает, что подписка не удалась', () => {
    // Молчаливый отказ оставлял человека в недоумении: кнопка
    // возвращалась в исходное состояние без всякого объяснения.
    render(
      <PushToggle
        publicKey="к"
        permission="default"
        isSubscribed={false}
        error="Не удалось включить уведомления"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось включить уведомления');
  });

  it('без ошибки сообщения нет', () => {
    render(<PushToggle publicKey="к" permission="default" isSubscribed={false} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
