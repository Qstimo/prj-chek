import { BUSY_LABEL, DENIED_TEXT, SUBSCRIBE_LABEL, UNSUBSCRIBE_LABEL } from './constants';
import type { IProps } from './types';

/**
 * Подписка этого устройства на уведомления о падениях.
 *
 * Состояние приходит пропсами, а не читается из `navigator`: обращения к
 * браузеру живут в контейнере на экране, и компонент остаётся чистым и
 * проверяемым без подделки глобалей.
 */
export function PushToggle({
  publicKey,
  permission,
  isSubscribed,
  isSupported = true,
  isBusy = false,
  error = null,
  onSubscribe,
  onUnsubscribe,
}: IProps) {
  // Ключей нет либо Push API нет: отправлять нечем, и предлагать нечего.
  if (!publicKey || !isSupported) {
    return null;
  }

  if (permission === 'denied') {
    return <p className="text-sm text-muted-foreground">{DENIED_TEXT}</p>;
  }

  const label = isSubscribed ? UNSUBSCRIBE_LABEL : SUBSCRIBE_LABEL;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={isBusy}
        onClick={() => (isSubscribed ? onUnsubscribe?.() : onSubscribe?.())}
        className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
      >
        {isBusy ? BUSY_LABEL : label}
      </button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
