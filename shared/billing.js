export const PLAN_DEFINITIONS = {
  monthly: {
    key: 'monthly',
    label: 'Monthly',
    priceCents: 2000,
    durationMonths: 1,
    includedSeats: {
      managers: 2,
      annotators: 10,
    },
  },
  yearly: {
    key: 'yearly',
    label: 'Yearly',
    priceCents: 20000,
    durationMonths: 12,
    includedSeats: {
      managers: 2,
      annotators: 10,
    },
  },
  lifetime: {
    key: 'lifetime',
    label: 'Lifetime',
    priceCents: 50000,
    durationMonths: null,
    includedSeats: {
      managers: 2,
      annotators: 10,
    },
  },
};

export const PLAN_ORDER = ['monthly', 'yearly', 'lifetime'];
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'other'];
export const SUBSCRIPTION_STATUSES = ['active', 'expired', 'canceled'];
export const DEMO_REQUEST_STATUSES = ['new', 'contacted', 'booked', 'closed'];
export const EMAIL_LOG_STATUSES = ['sent', 'failed'];
export const EMAIL_TYPES = [
  'free_trial_activated',
  'admin_welcome',
  'subscription_activated',
  'payment_receipt',
  'subscription_expiring',
  'subscription_expired',
  'subscription_reactivated',
];

export function getPlanDefinition(planType) {
  return PLAN_DEFINITIONS[planType] || null;
}

export function getPlanPriceCents(planType) {
  return getPlanDefinition(planType)?.priceCents ?? 0;
}

export function formatMoney(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}
