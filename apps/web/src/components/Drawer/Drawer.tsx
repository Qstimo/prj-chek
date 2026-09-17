'use client';

import * as Dialog from '@radix-ui/react-dialog';

import { WIDTH_CLASSES } from './constants';
import { DrawerWidth, type IProps } from './types';

/**
 * Панель, выезжающая справа (спека, раздел 3).
 *
 * Обёртка Radix Dialog: фокус-ловушка, Esc, клик по подложке и блокировка
 * прокрутки — от Radix. Подложка полупрозрачная: диаграмма остаётся видна.
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  width = DrawerWidth.Default,
  children,
}: IProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`fixed inset-y-0 right-0 z-50 w-full ${WIDTH_CLASSES[width]} animate-drawer-in space-y-4 overflow-y-auto border-l border-border bg-background p-6`}
        >
          <header className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-medium">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Закрыть"
              className="rounded-md border px-2 py-0.5 text-muted-foreground"
            >
              ×
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
