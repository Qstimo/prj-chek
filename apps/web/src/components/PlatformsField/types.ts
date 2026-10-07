import type { PlatformCreate } from '@cairn/shared';

/** Платформа в поле: с идентификатором при правке, без — при создании. */
export type FieldPlatform = PlatformCreate & { id?: string };

/** Пропсы поля платформ. */
export interface IProps {
  platforms: FieldPlatform[];
  onAdd: (input: PlatformCreate) => void;
  /**
   * Снятие платформы целиком, а не по имени: в режиме правки нужен её
   * идентификатор для мутации, и повторный поиск по имени заводил бы
   * второй способ сослаться на строку.
   */
  onRemove: (platform: FieldPlatform) => void;
}
