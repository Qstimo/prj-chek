/** Ключ предпочтения вида сводки проектов. */
export const PROJECT_LIST_VIEW_KEY = 'cairn.projectListView';

/** Допустимые виды сводки. */
export type ProjectListView = 'rows' | 'cards';

/** Вид по умолчанию — плотный реестр. */
export const DEFAULT_PROJECT_LIST_VIEW: ProjectListView = 'rows';

/** Читает сохранённый вид; неизвестное и отсутствие — дефолт. */
export function readProjectListView(): ProjectListView {
  if (typeof window === 'undefined') {
    return DEFAULT_PROJECT_LIST_VIEW;
  }

  const stored = window.localStorage.getItem(PROJECT_LIST_VIEW_KEY);

  return stored === 'cards' || stored === 'rows' ? stored : DEFAULT_PROJECT_LIST_VIEW;
}

/** Запоминает выбранный вид на этом устройстве. */
export function writeProjectListView(view: ProjectListView): void {
  window.localStorage.setItem(PROJECT_LIST_VIEW_KEY, view);
}
