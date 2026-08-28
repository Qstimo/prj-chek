import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { RequestSubject } from '../access/access.types';
import { ChronicleRepository } from '../chronicle/chronicle.repository';
import { DocsRepository } from '../docs/docs.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { RoadmapRepository } from '../roadmap/roadmap.repository';
import { StatusRepository } from '../status/status.repository';
import { VariablesRepository } from '../variables/variables.repository';
import { VariablesService } from '../variables/variables.service';

/** Репозитории, которыми пользуются инструменты. */
export interface McpDeps {
  projects: ProjectsRepository;
  docs: DocsRepository;
  roadmap: RoadmapRepository;
  chronicle: ChronicleRepository;
  variables: VariablesRepository;
  variablesService: VariablesService;
  status: StatusRepository;
}

/** Контекст токена: от чьего лица и над каким проектом работают инструменты. */
export interface McpContext {
  subject: RequestSubject;
  projectId: string;
  canRevealVariables: boolean;
  /** Журналирование вызова: имя инструмента и аргументы без значений. */
  recordCall: (tool: string, args: Record<string, unknown>) => Promise<void>;
}

/**
 * Схемы аргументов с явным типом: без него вывод типов перегрузок
 * `server.tool` уходит в бесконечную инстанциацию (TS2589).
 */
const SEARCH_ARGS: z.ZodRawShape = { query: z.string().min(1).max(200) };
const READ_PAGE_ARGS: z.ZodRawShape = { title: z.string().min(1).max(300) };
const LIST_KEYS_ARGS: z.ZodRawShape = { environment: z.string().min(1).max(100).optional() };
const REVEAL_ARGS: z.ZodRawShape = {
  environment: z.string().min(1).max(100),
  key: z.string().min(1).max(200),
};

/** Ответ инструмента: данные текстом, как ожидают клиенты MCP. */
function asText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Регистрирует инструменты MCP (ТЗ 7.2) — все только на чтение.
 *
 * Каждый инструмент работает через существующие репозитории с субъектом
 * токена: модель прав общая, обходов нет. `reveal_variable` регистрируется
 * только при включённом флаге — без него инструмента не существует.
 */
export function registerTools(server: McpServer, deps: McpDeps, context: McpContext): void {
  const { subject, projectId, recordCall } = context;

  // Перегрузки `server.tool` уводят tsc в бесконечную инстанциацию
  // (TS2589) — приведение к простой сигнатуре отсекает её, ничего
  // не меняя в рантайме. Аргументы обработчиков типизируются вручную.
  const addTool = server.tool.bind(server) as unknown as (
    name: string,
    description: string,
    schema: z.ZodRawShape,
    handler: (args: never) => Promise<ReturnType<typeof asText>>,
  ) => void;

  addTool('get_project_info', 'Паспорт проекта: назначение, стек, состояние', {}, async () => {
    await recordCall('get_project_info', {});

    return asText(await deps.projects.findById(subject, projectId));
  });

  addTool(
    'search_docs',
    'Поиск по документации проекта: заголовки и фрагменты',
    SEARCH_ARGS,
    async ({ query }: { query: string }) => {
      await recordCall('search_docs', { query });

      return asText(await deps.docs.search(subject, projectId, query));
    },
  );

  addTool(
    'read_doc_page',
    'Содержимое страницы документации по точному заголовку',
    READ_PAGE_ARGS,
    async ({ title }: { title: string }) => {
      await recordCall('read_doc_page', { title });

      const pages = await deps.docs.findForProject(subject, projectId);
      const match = pages.find((page) => page.title === title);

      if (!match) {
        return asText({ error: `Страница «${title}» не найдена` });
      }

      return asText(await deps.docs.findById(subject, projectId, match.id));
    },
  );

  addTool('get_roadmap', 'Роадмап: версии, чекпоинты и текущая стадия', {}, async () => {
    await recordCall('get_roadmap', {});

    return asText(await deps.roadmap.findForProject(subject, projectId));
  });

  addTool('read_chronicle', 'Хроника проекта: как мы к этому пришли', {}, async () => {
    await recordCall('read_chronicle', {});

    return asText(await deps.chronicle.findForProject(subject, projectId));
  });

  addTool(
    'list_variable_keys',
    'Ключи конфигурации с описаниями — без значений',
    LIST_KEYS_ARGS,
    async ({ environment }: { environment?: string }) => {
      await recordCall('list_variable_keys', { environment: environment ?? null });

      const environments = await deps.variables.listEnvironments(subject, projectId);
      const selected = environment
        ? environments.filter((candidate) => candidate.name === environment)
        : environments;

      const result = [];

      for (const target of selected) {
        result.push({
          environment: target.name,
          variables: await deps.variables.list(subject, projectId, target.id),
        });
      }

      return asText(result);
    },
  );

  addTool('get_status', 'Статус окружений и сроки доменов', {}, async () => {
    await recordCall('get_status', {});

    return asText(await deps.status.statusForProject(subject, projectId));
  });

  if (context.canRevealVariables) {
    addTool(
      'reveal_variable',
      'Раскрыть значение переменной. Каждое раскрытие фиксируется в журнале.',
      REVEAL_ARGS,
      async ({ environment, key }: { environment: string; key: string }) => {
        await recordCall('reveal_variable', { environment, key });

        const environments = await deps.variables.listEnvironments(subject, projectId);
        const target = environments.find((candidate) => candidate.name === environment);

        if (!target) {
          return asText({ error: `Окружение «${environment}» не найдено` });
        }

        const variables = await deps.variables.list(subject, projectId, target.id);
        const variable = variables.find((candidate) => candidate.key === key);

        if (!variable) {
          return asText({ error: `Переменная «${key}» не найдена` });
        }

        // Уровень токена — метаданные; раскрытие идёт отдельной ветвью
        // по явному флагу (ТЗ 7.3) и пишет штатный variable.revealed.
        const revealed = await deps.variablesService.revealForAgent(
          subject,
          projectId,
          target.id,
          variable.id,
        );

        return asText({ key, environment, ...revealed });
      },
    );
  }
}
