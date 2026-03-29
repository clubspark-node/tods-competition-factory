// Constants
import { MISSING_SANCTIONING_RECORD, MISSING_ENDORSEMENT } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, PersonReference } from '@Types/sanctioningTypes';

type RequestEndorsementArgs = {
  sanctioningRecord: SanctioningRecord;
  endorserId: string;
  endorserName?: string;
  endorserContact?: PersonReference;
};

export function requestEndorsement({
  sanctioningRecord,
  endorserId,
  endorserName,
  endorserContact,
}: RequestEndorsementArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!endorserId) return { error: INVALID_VALUES, context: { message: 'Missing endorserId' } };

  sanctioningRecord.endorsement = {
    status: 'PENDING',
    endorserId,
    endorserName,
    endorserContact,
  };

  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}

type EndorseApplicationArgs = {
  sanctioningRecord: SanctioningRecord;
  endorserNotes?: string;
  conditions?: string[];
};

export function endorseApplication({ sanctioningRecord, endorserNotes, conditions }: EndorseApplicationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!sanctioningRecord.endorsement) return { error: MISSING_ENDORSEMENT };

  sanctioningRecord.endorsement.status = 'ENDORSED';
  sanctioningRecord.endorsement.endorsedAt = new Date().toISOString();
  if (endorserNotes) sanctioningRecord.endorsement.endorserNotes = endorserNotes;
  if (conditions) sanctioningRecord.endorsement.conditions = conditions;

  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}

type DeclineEndorsementArgs = {
  sanctioningRecord: SanctioningRecord;
  declineReason?: string;
};

export function declineEndorsement({ sanctioningRecord, declineReason }: DeclineEndorsementArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!sanctioningRecord.endorsement) return { error: MISSING_ENDORSEMENT };

  sanctioningRecord.endorsement.status = 'DECLINED';
  sanctioningRecord.endorsement.declinedAt = new Date().toISOString();
  if (declineReason) sanctioningRecord.endorsement.declineReason = declineReason;

  sanctioningRecord.updatedAt = new Date().toISOString();
  sanctioningRecord.version += 1;

  return { ...SUCCESS };
}
