import type { DocPageDetail, DocPageMetadata } from '@cairn/shared';

/** Пропсы списка страниц. */
export interface IProps {
  pages: (DocPageMetadata | DocPageDetail)[];
  selectedId: string | null;
  canWrite?: boolean;
  onSelect: (id: string) => void;
}
