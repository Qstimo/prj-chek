'use client';

import { useEffect, useId, useRef, useState } from 'react';

/** Подсказка не перехватывает фокус и закрывается раньше содержащей её панели. */
export function useUnfinishedNotice(enabled: boolean) {
  const noticeId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const focused = useRef(false);
  const triggerHovered = useRef(false);
  const tooltipHovered = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelClose() {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  function show() {
    cancelClose();
    if (enabled) setIsVisible(true);
  }

  function closeWhenIdle() {
    cancelClose();
    // Даём указателю перейти с отметки на текст фиксированной подсказки.
    if (!focused.current && !triggerHovered.current && !tooltipHovered.current) {
      closeTimer.current = setTimeout(() => setIsVisible(false), 300);
    }
  }

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!enabled || !isVisible) return;
    function dismiss(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // Window capture раньше document capture у Radix: этот Escape закрывает
      // только объяснение, следующий снова попадает в обработчик панели.
      event.stopPropagation();
      cancelClose();
      triggerHovered.current = false;
      tooltipHovered.current = false;
      setIsVisible(false);
    }
    window.addEventListener('keydown', dismiss, true);
    return () => window.removeEventListener('keydown', dismiss, true);
  }, [enabled, isVisible]);

  return {
    noticeId,
    isVisible: enabled && isVisible,
    triggerProps: {
      onMouseEnter: () => { triggerHovered.current = true; show(); },
      onMouseLeave: () => { triggerHovered.current = false; closeWhenIdle(); },
      onFocus: () => { focused.current = true; show(); },
      onBlur: () => { focused.current = false; closeWhenIdle(); },
    },
    tooltipProps: {
      onMouseEnter: () => { tooltipHovered.current = true; show(); },
      onMouseLeave: () => { tooltipHovered.current = false; closeWhenIdle(); },
    },
  };
}
