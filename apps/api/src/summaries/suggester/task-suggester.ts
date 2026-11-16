/** Одна предложенная задача. Только формулировка — больше у чекпоинта нет. */
export interface TaskSuggestion {
  title: string;
}

/** Итог вызова: формулировки и сколько элементов ответа отброшено. */
export interface SuggestResult {
  tasks: TaskSuggestion[];
  dropped: number;
}
