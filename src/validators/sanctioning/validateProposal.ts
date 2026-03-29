// Constants
import { MISSING_SANCTIONING_POLICY, MISSING_PROPOSAL } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { TournamentProposal, SanctioningPolicy, SanctioningTier } from '@Types/sanctioningTypes';

export type ValidationIssue = {
  field: string;
  message: string;
  severity: 'error' | 'warning';
};

type ValidateProposalArgs = {
  proposal: TournamentProposal;
  sanctioningPolicy: SanctioningPolicy;
  sanctioningTier?: string;
};

export function validateProposal({ proposal, sanctioningPolicy, sanctioningTier }: ValidateProposalArgs) {
  if (!proposal) return { error: MISSING_PROPOSAL };
  if (!sanctioningPolicy) return { error: MISSING_SANCTIONING_POLICY };

  const issues: ValidationIssue[] = [];
  const tier = sanctioningTier ? sanctioningPolicy.tiers.find((t) => t.tierName === sanctioningTier) : undefined;

  // --- Global policy requirements ---
  if (sanctioningPolicy.requireInsurance && !proposal.insuranceCertificate) {
    issues.push({ field: 'insuranceCertificate', message: 'Insurance certificate required', severity: 'error' });
  }
  if (sanctioningPolicy.requireSafetyPlan && !proposal.safetyPlan) {
    issues.push({ field: 'safetyPlan', message: 'Safety plan required', severity: 'error' });
  }
  if (sanctioningPolicy.requireMedicalPlan && !proposal.medicalPlan) {
    issues.push({ field: 'medicalPlan', message: 'Medical plan required', severity: 'error' });
  }
  if (sanctioningPolicy.requireAntiCorruption && !proposal.antiCorruptionCompliance) {
    issues.push({
      field: 'antiCorruptionCompliance',
      message: 'Anti-corruption compliance required',
      severity: 'error',
    });
  }
  if (sanctioningPolicy.requireSafeguarding && !proposal.safeguardingCompliance) {
    issues.push({ field: 'safeguardingCompliance', message: 'Safeguarding compliance required', severity: 'error' });
  }

  // --- Lead time ---
  if (sanctioningPolicy.minimumLeadWeeks || tier?.minimumLeadWeeks) {
    const minWeeks = tier?.minimumLeadWeeks ?? sanctioningPolicy.minimumLeadWeeks ?? 0;
    const startDate = new Date(proposal.proposedStartDate);
    const now = new Date();
    const weeksUntil = (startDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000);
    if (weeksUntil < minWeeks) {
      issues.push({
        field: 'proposedStartDate',
        message: `Minimum ${minWeeks} weeks lead time required; ${Math.floor(weeksUntil)} weeks remaining`,
        severity: 'error',
      });
    }
  }

  // --- Tier-specific validation ---
  if (tier) {
    validateTierConstraints({ proposal, tier, issues });
  }

  // --- Personnel ---
  if (sanctioningPolicy.personnelRules) {
    for (const role of sanctioningPolicy.personnelRules.roles) {
      if (!role.required) continue;
      const hasRole = findPersonnelForRole(proposal, role.roleName);
      if (!hasRole) {
        issues.push({
          field: `personnel.${role.roleName}`,
          message: `Required role not filled: ${role.roleName}`,
          severity: 'error',
        });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const valid = errors.length === 0;

  return { ...SUCCESS, valid, issues, errors, warnings };
}

function validateTierConstraints({
  proposal,
  tier,
  issues,
}: {
  proposal: TournamentProposal;
  tier: SanctioningTier;
  issues: ValidationIssue[];
}) {
  // Prize money
  if (tier.minimumPrizeMoney !== undefined && proposal.totalPrizeMoney?.length) {
    const totalAmount = proposal.totalPrizeMoney.reduce((sum, pm) => sum + pm.amount, 0);
    if (totalAmount < tier.minimumPrizeMoney) {
      issues.push({
        field: 'totalPrizeMoney',
        message: `Minimum prize money for ${tier.tierName}: ${tier.minimumPrizeMoney}; proposed: ${totalAmount}`,
        severity: 'error',
      });
    }
  }

  if (tier.maximumPrizeMoney !== undefined && proposal.totalPrizeMoney?.length) {
    const totalAmount = proposal.totalPrizeMoney.reduce((sum, pm) => sum + pm.amount, 0);
    if (totalAmount > tier.maximumPrizeMoney) {
      issues.push({
        field: 'totalPrizeMoney',
        message: `Maximum prize money for ${tier.tierName}: ${tier.maximumPrizeMoney}; proposed: ${totalAmount}`,
        severity: 'error',
      });
    }
  }

  // Courts
  if (tier.minimumCourts !== undefined) {
    const totalCourts = proposal.venues?.reduce((sum, v) => sum + (v.numberOfCourts ?? 0), 0) ?? 0;
    if (totalCourts < tier.minimumCourts) {
      issues.push({
        field: 'venues',
        message: `Minimum ${tier.minimumCourts} courts required; proposed: ${totalCourts}`,
        severity: 'error',
      });
    }
  }

  // Event-level constraints
  for (let i = 0; i < proposal.events.length; i++) {
    const event = proposal.events[i];

    if (tier.allowedEventTypes?.length && !tier.allowedEventTypes.includes(event.eventType)) {
      issues.push({
        field: `events[${i}].eventType`,
        message: `Event type '${event.eventType}' not allowed for tier ${tier.tierName}`,
        severity: 'error',
      });
    }

    if (tier.allowedDrawTypes?.length && event.drawType && !tier.allowedDrawTypes.includes(event.drawType)) {
      issues.push({
        field: `events[${i}].drawType`,
        message: `Draw type '${event.drawType}' not allowed for tier ${tier.tierName}`,
        severity: 'error',
      });
    }

    if (tier.allowedDrawSizes?.length && event.drawSize && !tier.allowedDrawSizes.includes(event.drawSize)) {
      issues.push({
        field: `events[${i}].drawSize`,
        message: `Draw size ${event.drawSize} not allowed for tier ${tier.tierName}; allowed: ${tier.allowedDrawSizes.join(', ')}`,
        severity: 'error',
      });
    }

    if (
      tier.allowedMatchUpFormats?.length &&
      event.matchUpFormat &&
      !tier.allowedMatchUpFormats.includes(event.matchUpFormat)
    ) {
      issues.push({
        field: `events[${i}].matchUpFormat`,
        message: `Match format '${event.matchUpFormat}' not allowed for tier ${tier.tierName}`,
        severity: 'error',
      });
    }

    if (tier.allowedGenders?.length && event.gender && !tier.allowedGenders.includes(event.gender)) {
      issues.push({
        field: `events[${i}].gender`,
        message: `Gender '${event.gender}' not allowed for tier ${tier.tierName}`,
        severity: 'error',
      });
    }

    // Qualifying constraints
    if (event.qualifyingDrawSize) {
      if (tier.qualifyingAllowed === false) {
        issues.push({
          field: `events[${i}].qualifyingDrawSize`,
          message: `Qualifying not allowed for tier ${tier.tierName}`,
          severity: 'error',
        });
      } else if (tier.maxQualifyingDrawSize && event.qualifyingDrawSize > tier.maxQualifyingDrawSize) {
        issues.push({
          field: `events[${i}].qualifyingDrawSize`,
          message: `Qualifying draw size ${event.qualifyingDrawSize} exceeds maximum ${tier.maxQualifyingDrawSize}`,
          severity: 'error',
        });
      }
    }
  }
}

function findPersonnelForRole(proposal: TournamentProposal, roleName: string): boolean {
  const lowerRole = roleName.toLowerCase();
  if (lowerRole.includes('director') && proposal.tournamentDirector?.personName) return true;
  if (lowerRole.includes('referee') && proposal.referee?.personName) return true;
  return proposal.officials?.some((o) => o.role.toLowerCase().includes(lowerRole)) ?? false;
}
