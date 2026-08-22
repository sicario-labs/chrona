export type TierPlan = 'free' | 'pro' | 'team';

export interface PlanLimits {
  name: string;
  priceMonthly: number;
  maxRepositories: number;
  maxVerificationsMonthly: number;
  ssoSupported: boolean;
  customRulesSupported: boolean;
  priorityWorkers: boolean;
}

export const PRICING_PLANS: Record<TierPlan, PlanLimits> = {
  free: {
    name: 'Free Tier',
    priceMonthly: 0,
    maxRepositories: 3,
    maxVerificationsMonthly: 100,
    ssoSupported: false,
    customRulesSupported: false,
    priorityWorkers: false,
  },
  pro: {
    name: 'Pro Tier',
    priceMonthly: 49,
    maxRepositories: 20,
    maxVerificationsMonthly: 2000,
    ssoSupported: false,
    customRulesSupported: true,
    priorityWorkers: true,
  },
  team: {
    name: 'Team Tier',
    priceMonthly: 199,
    maxRepositories: Infinity,
    maxVerificationsMonthly: Infinity,
    ssoSupported: true,
    customRulesSupported: true,
    priorityWorkers: true,
  },
};

export function checkQuota(
  plan: TierPlan,
  currentRepos: number,
  currentVerifications: number
): { allowed: boolean; reason?: string } {
  const limits = PRICING_PLANS[plan];
  if (!limits) return { allowed: false, reason: 'Invalid plan' };

  if (currentRepos > limits.maxRepositories) {
    return {
      allowed: false,
      reason: `Repository limit reached (${currentRepos}/${limits.maxRepositories}) for ${limits.name}. Upgrade to increase limits.`,
    };
  }

  if (currentVerifications > limits.maxVerificationsMonthly) {
    return {
      allowed: false,
      reason: `Monthly verification quota exceeded (${currentVerifications}/${limits.maxVerificationsMonthly}) for ${limits.name}.`,
    };
  }

  return { allowed: true };
}
