import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PlatformKind, PlatformReleaseState, RoadmapVersionState } from '@cairn/shared';
import { RoadmapTimeline } from '../RoadmapTimeline/RoadmapTimeline';
import { CheckpointItem } from './CheckpointItem';
import { ReleaseRow } from './ReleaseRow';
import { VersionDrawer } from './VersionDrawer';
import { TimelineHrefProvider } from '../RoadmapTimeline/href';

const description = /Версия выпущена.*следующую версию/;
const checkpoint = { id: 'c', taskId: 't-c', title: 'ОченьДлиннаяФормулировка'.repeat(20), isDone: false, url: null, position: 1, platformIds: [] };
const props = { checkpoint, canWrite: false, onToggle: vi.fn(), onDelete: vi.fn() };

describe('предупреждения и длинные подписи роадмапа', () => {
  it('первый Escape скрывает объяснение, второй закрывает панель без потери фокуса', async () => {
    const onClose = vi.fn();
    const version = { id: 'v', label: 'v1', state: RoadmapVersionState.Released, plannedDate: null, releasedDate: null, position: 1, progress: { done: 0, total: 1 }, unfinished: 1, hasUnfinishedOnRelease: true, checkpoints: [checkpoint], releases: [] };
    function Subject() {
      const [open, setOpen] = useState(true);
      return <VersionDrawer version={version} isOpen={open} isCurrent={false} onClose={() => { onClose(); setOpen(false); }} />;
    }
    render(<Subject />);
    const indicator = screen.getByLabelText('Не закрыт после выпуска');
    act(() => indicator.focus());
    expect(screen.getByRole('tooltip')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(indicator).toHaveFocus();
    expect(indicator).toHaveAccessibleDescription(description);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('подсказка версии остаётся при наведении на сам текст и закрывается по Escape', async () => {
    const version = { id: 'v', label: 'v1', state: RoadmapVersionState.Released, plannedDate: null, releasedDate: null, progress: { done: 0, total: 1 }, unfinished: 1, hasUnfinishedOnRelease: true };
    render(<TimelineHrefProvider hrefOf={() => '/report'}><RoadmapTimeline versions={[version]} currentIndex={null} onSelect={vi.fn()} /></TimelineHrefProvider>);
    const link = screen.getByRole('link', { name: 'Версия v1' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await userEvent.hover(link);
    const tooltip = screen.getByRole('tooltip');
    await userEvent.hover(tooltip);
    expect(tooltip).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => link.focus());
    expect(screen.getByRole('tooltip')).toBeVisible();
    act(() => link.blur());
    await userEvent.unhover(tooltip);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });
  it('даёт публичному незакрытому чекпоинту фокусируемое объяснение', () => {
    render(<CheckpointItem {...props} markUnfinished />);
    const indicator = screen.getByLabelText('Не закрыт после выпуска');
    expect(indicator).toHaveAttribute('tabindex', '0');
    expect(indicator).toHaveAccessibleDescription(description);
    act(() => indicator.focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent(description);
  });
  it.each([false, true])('не помечает обычный backlog или закрытый чекпоинт: %s', (isDone) => {
    render(<CheckpointItem {...props} checkpoint={{ ...checkpoint, isDone }} markUnfinished={isDone} />);
    expect(screen.queryByLabelText('Не закрыт после выпуска')).not.toBeInTheDocument();
  });
  it('сохраняет полную подпись ограниченной кнопки переноса', () => {
    const target = 'СледующаяВерсия'.repeat(25);
    render(<CheckpointItem {...props} canWrite onCarryOver={vi.fn()} carryOverTargetLabel={target} />);
    const button = screen.getByRole('button', { name: /Перенести/ });
    expect(button).toHaveAttribute('title', button.getAttribute('aria-label'));
    expect(button).toHaveClass('w-36', 'shrink-0', 'truncate');
    expect(screen.getByText(checkpoint.title)).toHaveClass('min-w-0', 'break-words');
  });
  it('ссылка версии сохраняет описание и не содержит вложенных кнопок', () => {
    const version = { id: 'v', label: 'v1', state: RoadmapVersionState.Released, plannedDate: null, releasedDate: null, progress: { done: 0, total: 1 }, unfinished: 1, hasUnfinishedOnRelease: true };
    render(<TimelineHrefProvider hrefOf={() => '/report'}><RoadmapTimeline versions={[version]} currentIndex={null} onSelect={vi.fn()} /></TimelineHrefProvider>);
    const link = screen.getByRole('link', { name: 'Версия v1' });
    expect(link).toHaveAccessibleDescription(/Незакрытых чекпоинтов: 1/);
    expect(link.querySelector('button, [tabindex]')).toBeNull();
  });
  it('просмотр платформы показывает дату и полные длинные подписи в ограниченных колонках', () => {
    const platform = { id: 'p', name: 'ОченьДлиннаяПлатформа'.repeat(15), kind: PlatformKind.Store, position: 1 };
    const cell = { state: PlatformReleaseState.Released, releasedDate: '2026-11-16', buildLabel: 'Сборка'.repeat(50) };
    render(<ReleaseRow platform={platform} cell={cell} versionLabel="v1" />);
    expect(screen.getByText(platform.name)).toHaveClass('w-40', 'shrink-0', 'break-words');
    expect(screen.getByText(cell.buildLabel)).toHaveClass('w-40', 'break-words');
    expect(screen.getByText('16.11.2026')).toHaveAttribute('datetime', '2026-11-16');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
  it('панель релиза использует собственную широкую границу', () => {
    const version = { id: 'v', label: 'v1', state: RoadmapVersionState.Released, plannedDate: null, releasedDate: null, position: 1, progress: { done: 0, total: 1 }, unfinished: 1, hasUnfinishedOnRelease: true, checkpoints: [checkpoint], releases: [] };
    render(<VersionDrawer version={version} isOpen isCurrent={false} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveClass('w-full', 'max-w-[1024px]');
    expect(screen.getByLabelText('Не закрыт после выпуска')).toHaveAccessibleDescription(description);
    expect(screen.queryByRole('button', { name: /Перенести/ })).not.toBeInTheDocument();
  });
  it.each(['serpentine', 'strip', 'list'] as const)('помечает выпущенный узел и объясняет счёт: %s', (form) => {
    const base = { id: 'v', label: 'ДлиннаяВерсия'.repeat(20), state: RoadmapVersionState.Released, plannedDate: null, releasedDate: null, progress: { done: 1, total: 3 }, unfinished: 2, hasUnfinishedOnRelease: true };
    render(<RoadmapTimeline versions={[base, { ...base, id: 'next', label: 'Backlog', state: RoadmapVersionState.Planned, hasUnfinishedOnRelease: false }, { ...base, id: 'done', label: 'Готово', progress: { done: 3, total: 3 }, unfinished: 0, hasUnfinishedOnRelease: false }]} currentIndex={null} form={form} onSelect={vi.fn()} />);
    expect(screen.getAllByText('!')).toHaveLength(1);
    expect(screen.getByRole('button', { name: `Версия ${base.label}` })).toHaveAccessibleDescription(/Незакрытых чекпоинтов: 2.*следующую версию/);
    expect(screen.getByRole('button', { name: 'Версия Backlog' })).not.toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: 'Версия Готово' })).not.toHaveAttribute('aria-describedby');
  });
});
