export { CheckpointForm } from './CheckpointForm';
// Чекбоксы платформ переиспользует редактор черновика саммари: теги
// уезжают в тот же чекпоинт, и второй набор разошёлся бы с первым. Тот же
// приём, которым форма релиза берёт `StateField` из `VersionFields`.
export { PlatformsToggles } from './PlatformsToggles';
export type { IProps } from './types';
