/** Постоянная ссылка Weeek. Другие адреса остаются обычными ссылками задачи. */
export function weeekTaskLinkOf(raw: string | null): { workspaceId: string; taskId: string } | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.origin !== 'https://app.weeek.net' || url.username || url.password) {
      return null;
    }
    const match = /^\/ws\/([1-9]\d*)\/(?:task|board\/[1-9]\d*)\/([1-9]\d*)\/?$/.exec(url.pathname);
    return match ? { workspaceId: match[1]!, taskId: match[2]! } : null;
  } catch {
    return null;
  }
}

export const TRACKER_LINK_REQUIRED = 'tracker_link_required';
export const TRACKER_LINK_INVALID = 'tracker_link_invalid';

/** В том числе неполная ссылка: она не должна приводить к созданию дубля. */
export function isWeeekLink(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.origin === 'https://app.weeek.net' && url.pathname.startsWith('/ws/');
  } catch {
    return false;
  }
}
