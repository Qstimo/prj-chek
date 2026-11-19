'use client';

import type { ModelProbeResult as ProbeResult, ModelServiceKind, ModelServiceUpdate } from '@cairn/shared';
import { useState } from 'react';

import { describeApiError } from '@/api';
import {
  useMutationClearModelService,
  useMutationProbeModelService,
  useMutationSaveModelService,
  useQueryModelServices,
} from '@/api/hooks';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Drawer, DrawerWidth } from '@/components/Drawer';
import { Loader } from '@/components/Loader';
import { ModelProbeResult } from '@/components/ModelProbeResult';
import { ModelServiceCard } from '@/components/ModelServiceCard';
import { ModelServiceForm } from '@/components/ModelServiceForm';
import { CLEAR_WARNING } from './constants';

/**
 * Экран настройки служб модели.
 *
 * Исход проверки связи живёт в состоянии экрана, а не в кэше запросов: он
 * нужен человеку рядом с карточкой, пока он правит поле, и исчезает только
 * со следующей проверкой или сохранением.
 */
export function ModelServicesScreen() {
  const services = useQueryModelServices();
  const save = useMutationSaveModelService();
  const clear = useMutationClearModelService();
  const probe = useMutationProbeModelService();
  const [editing, setEditing] = useState<ModelServiceKind | null>(null);
  const [clearing, setClearing] = useState<ModelServiceKind | null>(null);
  const [probes, setProbes] = useState<Partial<Record<ModelServiceKind, ProbeResult>>>({});

  if (services.isPending) {
    return <Loader size="page" />;
  }

  if (services.isError || !services.data) {
    return (
      <p role="alert" className="text-destructive">
        Не удалось загрузить настройки служб модели.
      </p>
    );
  }

  async function runProbe(kind: ModelServiceKind): Promise<void> {
    const result = await probe.mutateAsync(kind);

    setProbes((current) => ({ ...current, [kind]: result }));
  }

  async function runSave(kind: ModelServiceKind, input: ModelServiceUpdate): Promise<void> {
    await save.mutateAsync({ kind, input });
    // Исход прежней проверки снимается: он относился к прежней
    // настройке, и оставить его значило бы выдать старую проверку за
    // проверку новой.
    setProbes((current) => ({ ...current, [kind]: undefined }));
    setEditing(null);
  }

  const settings = services.data.find((candidate) => candidate.kind === editing);

  return (
    <div className="space-y-4">
      {(save.isError || clear.isError || probe.isError) && (
        <p role="alert" className="text-destructive">
          {describeApiError(save.error ?? clear.error ?? probe.error)}
        </p>
      )}

      {services.data.map((service) => (
        <ModelServiceCard
          key={service.kind}
          settings={service}
          onEdit={() => setEditing(service.kind)}
          onProbe={() => void runProbe(service.kind)}
          onClear={() => setClearing(service.kind)}
          isProbing={probe.isPending}
          probe={
            probes[service.kind] && <ModelProbeResult result={probes[service.kind]!} />
          }
        />
      ))}

      {clearing && (
        <ConfirmDialog
          label="Вернуть настройку окружения"
          confirmLabel="Да, вернуть"
          onConfirm={() => {
            void clear.mutateAsync(clearing);
            setClearing(null);
          }}
          onCancel={() => setClearing(null)}
        >
          {CLEAR_WARNING}
        </ConfirmDialog>
      )}

      <Drawer
        isOpen={settings !== undefined}
        onClose={() => setEditing(null)}
        title="Настройка узла"
        width={DrawerWidth.Half}
      >
        {settings && (
          <ModelServiceForm
            settings={settings}
            onSave={(input) => void runSave(settings.kind, input)}
            onClose={() => setEditing(null)}
            isSubmitting={save.isPending}
          />
        )}
      </Drawer>
    </div>
  );
}
