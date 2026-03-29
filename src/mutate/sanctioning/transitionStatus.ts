import { validateStatusTransition } from '@Validators/sanctioning/validateStatusTransition';

// Constants
import { MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, SanctioningStatus, StatusTransition } from '@Types/sanctioningTypes';

type TransitionStatusArgs = {
  sanctioningRecord: SanctioningRecord;
  toStatus: SanctioningStatus;
  transitionedBy?: string;
  reason?: string;
};

export function transitionStatus({ sanctioningRecord, toStatus, transitionedBy, reason }: TransitionStatusArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const validation = validateStatusTransition({ fromStatus: sanctioningRecord.status, toStatus });
  if (validation.error) return validation;

  const now = new Date().toISOString();

  const transition: StatusTransition = {
    fromStatus: sanctioningRecord.status,
    toStatus,
    transitionedAt: now,
    transitionedBy,
    reason,
  };

  sanctioningRecord.statusHistory ??= [];
  sanctioningRecord.statusHistory.push(transition);
  sanctioningRecord.status = toStatus;
  sanctioningRecord.updatedAt = now;
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}
