'use client';

import type { IProps } from './types';

/** Показывает выданную одноразовую ссылку с предупреждением. */
export function IssuedLink({ link, title }: IProps) {
  return (
    <div className="space-y-2 rounded-md border border-border p-4">
      <p className="font-medium">{title}</p>
      <p className="break-all rounded-md bg-muted p-2 font-mono text-sm">{link.url}</p>
      <p className="text-sm text-muted-foreground">
        Скопируйте ссылку и передайте её лично: она показывается один раз и действует до{' '}
        {new Date(link.expiresAt).toLocaleString('ru-RU')}.
      </p>
    </div>
  );
}
