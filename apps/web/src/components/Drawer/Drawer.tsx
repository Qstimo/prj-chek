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
  actions,
  children,
}: IProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          // Верхнего отступа у панели нет: его держит шапка. Прилипший
          // элемент пинается к верху padding box, и `pt-6` оставил бы над
          // шапкой полосу, через которую при прокрутке просвечивает текст.
          className={`fixed inset-y-0 right-0 z-50 w-full ${WIDTH_CLASSES[width]} animate-drawer-in space-y-4 overflow-y-auto border-l border-border bg-background px-6 pb-6`}
        >
          {/*
            Шапка прилипает к верху: содержимое панели прокручивается,
            и уехавшая шапка унесла бы с собой и закрытие, и сохранение.
            Отрицательные поля по бокам растягивают её фон на отступы
            панели, а верхний отступ она держит сама (см. выше).
          */}
          <header className="sticky top-0 z-10 -mx-6 flex items-start justify-between gap-4 bg-background px-6 pb-4 pt-6">
            <Dialog.Title className="text-lg font-medium">{title}</Dialog.Title>
            <div className="flex items-center gap-2">
              {actions}
              <Dialog.Close
                aria-label="Закрыть"
                className="rounded-md border px-2 py-0.5 text-muted-foreground"
              >
                ×
              </Dialog.Close>
            </div>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
