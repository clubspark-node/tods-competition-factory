import { transitionStatus } from './transitionStatus';

// Constants
import { MISSING_SANCTIONING_RECORD, ENDORSEMENT_REQUIRED, SUBMITTED } from '@Constants/sanctioningConstants';

// Types
import type { SanctioningRecord, SanctioningPolicy } from '@Types/sanctioningTypes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

type SubmitApplicationArgs = {
  sanctioningRecord: SanctioningRecord;
  sanctioningPolicy?: SanctioningPolicy;
  submittedBy?: string;
};

export function submitApplication({ sanctioningRecord, sanctioningPolicy, submittedBy }: SubmitApplicationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  // Check endorsement gate if policy requires it
  const requireEndorsement = sanctioningPolicy?.requireEndorsement ?? false;
  if (requireEndorsement) {
    const endorsementStatus = sanctioningRecord.endorsement?.status;
    if (endorsementStatus !== 'ENDORSED' && endorsementStatus !== 'NOT_REQUIRED') {
      return { error: ENDORSEMENT_REQUIRED };
    }
  }

  const result = transitionStatus({
    sanctioningRecord,
    toStatus: SUBMITTED,
    transitionedBy: submittedBy,
    reason: 'Application submitted',
  });
  if (result.error) return result;

  sanctioningRecord.submittedAt = sanctioningRecord.updatedAt;

  // Snapshot policy version at submission time
  if (sanctioningPolicy) {
    sanctioningRecord.policyVersion = sanctioningPolicy.policyVersion;
    sanctioningRecord.policySnapshot = makeDeepCopy(sanctioningPolicy, false, true);
  }

  return result;
}
