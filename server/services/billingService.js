import crypto from 'crypto';
import { addMonths, differenceInCalendarDays, isBefore } from 'date-fns';
import { getDatabase } from './database.js';
import { canManageBilling } from './permissions.js';
import {
  DEMO_REQUEST_STATUSES,
  EMAIL_TYPES,
  PAYMENT_METHODS,
  PLAN_DEFINITIONS,
  PLAN_ORDER,
  SUBSCRIPTION_STATUSES,
  formatMoney,
  getPlanDefinition,
  getPlanPriceCents,
} from '../../shared/billing.js';
import { sendTransactionalEmail } from './emailService.js';

const SETTINGS_KEYS = ['calendly_url', 'resend_from_email', 'billing_reply_to_email'];
const REMINDER_WINDOW_DAYS = 3;

function nowTs() {
  return Date.now();
}

function getFirstConfiguredEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function ensureStatus(value) {
  return SUBSCRIPTION_STATUSES.includes(value) ? value : 'active';
}

function ensurePlanType(value) {
  return PLAN_ORDER.includes(value) ? value : 'monthly';
}

function ensurePaymentMethod(value) {
  return PAYMENT_METHODS.includes(value) ? value : 'cash';
}

function ensureDemoStatus(value) {
  return DEMO_REQUEST_STATUSES.includes(value) ? value : 'new';
}

function addPlanDuration(planType, timestamp) {
  const plan = getPlanDefinition(planType);
  if (!plan || plan.durationMonths === null) return null;
  return addMonths(new Date(timestamp), plan.durationMonths).getTime();
}

function countElapsedCycles(planType, billingAnchorAt, currentTime = nowTs()) {
  const plan = getPlanDefinition(planType);
  if (!plan || plan.durationMonths === null) {
    return billingAnchorAt <= currentTime ? 1 : 0;
  }

  if (billingAnchorAt > currentTime) return 0;

  let count = 0;
  let cursor = billingAnchorAt;
  while (cursor <= currentTime) {
    count += 1;
    const nextCursor = addMonths(new Date(cursor), plan.durationMonths).getTime();
    if (nextCursor === cursor) break;
    cursor = nextCursor;
  }
  return count;
}

function getNextBillingDate(planType, billingAnchorAt, currentTime = nowTs()) {
  const plan = getPlanDefinition(planType);
  if (!plan || plan.durationMonths === null) return null;
  if (billingAnchorAt > currentTime) return billingAnchorAt;

  let cursor = billingAnchorAt;
  while (cursor <= currentTime) {
    cursor = addMonths(new Date(cursor), plan.durationMonths).getTime();
  }
  return cursor;
}

function parseSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    contactEmail: row.contact_email || '',
    planType: row.plan_type,
    status: row.status,
    startAt: row.start_at,
    billingAnchorAt: row.billing_anchor_at,
    expiresAt: row.expires_at,
    priceSnapshotCents: row.price_snapshot_cents,
    notes: row.notes || '',
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePayment(row) {
  return {
    id: row.id,
    userId: row.user_id,
    amountCents: row.amount_cents,
    paymentMethod: row.payment_method,
    reference: row.reference || '',
    notes: row.notes || '',
    paidAt: row.paid_at,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  };
}

function parseEmailLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    subscriptionId: row.subscription_id,
    paymentRecordId: row.payment_record_id,
    emailType: row.email_type,
    recipientEmail: row.recipient_email,
    resendMessageId: row.resend_message_id,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export function getSettings() {
  const db = getDatabase();
  const rows = db.prepare('SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)').all(...SETTINGS_KEYS);
  const map = Object.fromEntries(SETTINGS_KEYS.map((key) => [key, '']));
  for (const row of rows) {
    map[row.key] = row.value || '';
  }
  if (!map.resend_from_email) {
    map.resend_from_email = getFirstConfiguredEnv('RESEND_FROM_EMAIL', 'NOTIFICATIONS_FROM_EMAIL');
  }
  if (!map.billing_reply_to_email) {
    map.billing_reply_to_email = getFirstConfiguredEnv('BILLING_REPLY_TO_EMAIL', 'NOTIFICATIONS_REPLY_TO_EMAIL');
  }
  return map;
}

export function getPublicMarketingSettings() {
  const settings = getSettings();
  return {
    calendlyUrl: settings.calendly_url || '',
  };
}

export function updateSettings(input, actorId) {
  const db = getDatabase();
  const nextSettings = {
    calendly_url: String(input.calendlyUrl ?? input.calendly_url ?? '').trim(),
    resend_from_email: String(input.resendFromEmail ?? input.resend_from_email ?? '').trim(),
    billing_reply_to_email: String(input.billingReplyToEmail ?? input.billing_reply_to_email ?? '').trim(),
  };
  const statement = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);

  const timestamp = nowTs();
  for (const [key, value] of Object.entries(nextSettings)) {
    statement.run(key, value, timestamp, actorId || null);
  }

  return {
    calendlyUrl: nextSettings.calendly_url,
    resendFromEmail: nextSettings.resend_from_email,
    billingReplyToEmail: nextSettings.billing_reply_to_email,
  };
}

export function getSubscriptionRowForUser(userId) {
  return getDatabase()
    .prepare('SELECT * FROM subscriptions WHERE user_id = ?')
    .get(userId);
}

export function listPaymentsForUser(userId) {
  const rows = getDatabase()
    .prepare('SELECT * FROM payment_records WHERE user_id = ? ORDER BY paid_at DESC, created_at DESC')
    .all(userId);
  return rows.map(parsePayment);
}

export function listEmailLogs({ userId = null, limit = 50 } = {}) {
  const db = getDatabase();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = userId
    ? db.prepare(`
        SELECT l.*, u.username
        FROM subscription_email_log l
        LEFT JOIN users u ON u.id = l.user_id
        WHERE l.user_id = ?
        ORDER BY l.created_at DESC
        LIMIT ?
      `).all(userId, safeLimit)
    : db.prepare(`
        SELECT l.*, u.username
        FROM subscription_email_log l
        LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.created_at DESC
        LIMIT ?
      `).all(safeLimit);

  return rows.map((row) => ({
    ...parseEmailLog(row),
    username: row.username || '',
  }));
}

export function getSubscriptionSummary(userId) {
  const db = getDatabase();
  const user = db.prepare('SELECT id, username, roles, created_at, updated_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const subscription = parseSubscription(getSubscriptionRowForUser(userId));
  const payments = listPaymentsForUser(userId);
  const roles = JSON.parse(user.roles);
  const currentTime = nowTs();

  let totalChargedCents = 0;
  let nextBillingDate = null;
  let planPriceCents = 0;

  if (subscription) {
    planPriceCents = subscription.priceSnapshotCents || getPlanPriceCents(subscription.planType);
    if (subscription.planType === 'lifetime') {
      totalChargedCents = subscription.status === 'canceled' ? 0 : planPriceCents;
    } else if (subscription.billingAnchorAt) {
      totalChargedCents = countElapsedCycles(subscription.planType, subscription.billingAnchorAt, currentTime) * planPriceCents;
      nextBillingDate = getNextBillingDate(subscription.planType, subscription.billingAnchorAt, currentTime);
    }
  }

  const totalPaidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const amountDueCents = Math.max(totalChargedCents - totalPaidCents, 0);
  const creditCents = Math.max(totalPaidCents - totalChargedCents, 0);
  const activeAccess = subscription
    ? (
      subscription.status === 'active'
      && (subscription.planType === 'lifetime' || (subscription.expiresAt !== null && subscription.expiresAt >= currentTime))
    )
    : false;

  return {
    userId: user.id,
    username: user.username,
    roles,
    subscription,
    payments,
    planPriceCents,
    totalChargedCents,
    totalPaidCents,
    amountDueCents,
    creditCents,
    nextBillingDate,
    activeAccess,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export function listBillingUsers() {
  const db = getDatabase();
  const users = db.prepare('SELECT id FROM users ORDER BY created_at DESC').all();
  return users
    .map((row) => getSubscriptionSummary(row.id))
    .filter(Boolean);
}

export function getUserAccessState(user) {
  if (!user) {
    return {
      hasActiveAccess: false,
      accessStatus: 'unauthenticated',
      reason: 'Login required',
      subscriptionSummary: null,
    };
  }

  if (canManageBilling(user)) {
    return {
      hasActiveAccess: true,
      accessStatus: 'super_admin',
      reason: 'Super admin access',
      subscriptionSummary: null,
    };
  }

  const summary = getSubscriptionSummary(user.id);
  if (!summary?.subscription) {
    return {
      hasActiveAccess: false,
      accessStatus: 'inactive',
      reason: 'No active subscription has been assigned to this account.',
      subscriptionSummary: null,
    };
  }

  return {
    hasActiveAccess: summary.activeAccess,
    accessStatus: summary.activeAccess ? 'active' : 'inactive',
    reason: summary.activeAccess ? 'Active subscription' : 'Subscription expired or inactive',
    subscriptionSummary: summary,
  };
}

export function upsertSubscription(userId, input, actorId) {
  const db = getDatabase();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('User not found');

  const planType = ensurePlanType(input.planType);
  const status = ensureStatus(input.status);
  const startAt = numberOrNull(input.startAt) ?? nowTs();
  const billingAnchorAt = numberOrNull(input.billingAnchorAt) ?? startAt;
  const expiresAt = planType === 'lifetime' ? null : addPlanDuration(planType, startAt);
  const notes = String(input.notes ?? '').trim();
  const contactEmail = String(input.contactEmail ?? '').trim();
  const currentTime = nowTs();
  const existing = getSubscriptionRowForUser(userId);

  if (existing) {
    db.prepare(`
      UPDATE subscriptions
      SET contact_email = ?, plan_type = ?, status = ?, start_at = ?, billing_anchor_at = ?,
          expires_at = ?, price_snapshot_cents = ?, notes = ?, updated_by = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      contactEmail,
      planType,
      status,
      startAt,
      billingAnchorAt,
      expiresAt,
      getPlanPriceCents(planType),
      notes,
      actorId || null,
      currentTime,
      userId,
    );
  } else {
    db.prepare(`
      INSERT INTO subscriptions (
        id, user_id, contact_email, plan_type, status, start_at, billing_anchor_at, expires_at,
        price_snapshot_cents, notes, updated_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      userId,
      contactEmail,
      planType,
      status,
      startAt,
      billingAnchorAt,
      expiresAt,
      getPlanPriceCents(planType),
      notes,
      actorId || null,
      currentTime,
      currentTime,
    );
  }

  return getSubscriptionSummary(userId);
}

export function recordPayment(userId, input, actorId) {
  const db = getDatabase();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('User not found');

  const amountCents = Number(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  const paymentId = crypto.randomUUID();
  const paidAt = numberOrNull(input.paidAt) ?? nowTs();
  const createdAt = nowTs();
  db.prepare(`
    INSERT INTO payment_records (
      id, user_id, amount_cents, payment_method, reference, notes, paid_at, recorded_by, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    paymentId,
    userId,
    Math.round(amountCents),
    ensurePaymentMethod(input.paymentMethod),
    String(input.reference ?? '').trim(),
    String(input.notes ?? '').trim(),
    paidAt,
    actorId || null,
    createdAt,
  );

  return {
    payment: parsePayment(db.prepare('SELECT * FROM payment_records WHERE id = ?').get(paymentId)),
    summary: getSubscriptionSummary(userId),
  };
}

export function createDemoRequest(input) {
  const db = getDatabase();
  const name = String(input.name ?? '').trim();
  const email = String(input.email ?? '').trim();

  if (!name) throw new Error('Name is required');
  if (!email) throw new Error('Email is required');

  const timestamp = nowTs();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO demo_requests (id, name, email, organization, phone, message, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)
  `).run(
    id,
    name,
    email,
    String(input.organization ?? '').trim(),
    String(input.phone ?? '').trim(),
    String(input.message ?? '').trim(),
    timestamp,
    timestamp,
  );

  return {
    id,
    redirectUrl: getPublicMarketingSettings().calendlyUrl,
  };
}

export function listDemoRequests() {
  const rows = getDatabase()
    .prepare('SELECT * FROM demo_requests ORDER BY created_at DESC')
    .all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    organization: row.organization || '',
    phone: row.phone || '',
    message: row.message || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function updateDemoRequestStatus(id, status) {
  const nextStatus = ensureDemoStatus(status);
  const timestamp = nowTs();
  const result = getDatabase()
    .prepare('UPDATE demo_requests SET status = ?, updated_at = ? WHERE id = ?')
    .run(nextStatus, timestamp, id);

  if (result.changes === 0) {
    throw new Error('Demo request not found');
  }

  return listDemoRequests().find((request) => request.id === id);
}

function logEmailAttempt({ userId, subscriptionId = null, paymentRecordId = null, emailType, recipientEmail, status, errorMessage = null, resendMessageId = null }) {
  const id = crypto.randomUUID();
  getDatabase().prepare(`
    INSERT INTO subscription_email_log (
      id, user_id, subscription_id, payment_record_id, email_type, recipient_email, resend_message_id, status, error_message, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    subscriptionId,
    paymentRecordId,
    emailType,
    recipientEmail,
    resendMessageId,
    status,
    errorMessage,
    nowTs(),
  );
}

function buildEmailContent(emailType, summary, payment = null) {
  const planLabel = summary.subscription ? PLAN_DEFINITIONS[summary.subscription.planType]?.label || summary.subscription.planType : 'No plan';
  const startDate = summary.subscription?.startAt ? new Date(summary.subscription.startAt).toLocaleDateString('en-US') : 'N/A';
  const expiryDate = summary.subscription?.expiresAt ? new Date(summary.subscription.expiresAt).toLocaleDateString('en-US') : 'Lifetime access';
  const nextBillingDate = summary.nextBillingDate ? new Date(summary.nextBillingDate).toLocaleDateString('en-US') : 'N/A';
  const amountDue = formatMoney(summary.amountDueCents);
  const totalPaid = formatMoney(summary.totalPaidCents);
  const paymentAmount = payment ? formatMoney(payment.amountCents) : null;

  const messageMap = {
    subscription_activated: {
      subject: `Your ${planLabel} subscription is active`,
      intro: `Your ${planLabel.toLowerCase()} access to Tawjeeh Annotation has been activated.`,
    },
    payment_receipt: {
      subject: `Payment received for Tawjeeh Annotation`,
      intro: `We recorded your payment of ${paymentAmount}.`,
    },
    subscription_expiring: {
      subject: `Your Tawjeeh Annotation subscription is expiring soon`,
      intro: `Your ${planLabel.toLowerCase()} access is approaching its expiry date.`,
    },
    subscription_expired: {
      subject: `Your Tawjeeh Annotation subscription has expired`,
      intro: `Your ${planLabel.toLowerCase()} access has expired and needs renewal.`,
    },
    subscription_reactivated: {
      subject: `Your Tawjeeh Annotation access has been reactivated`,
      intro: `Your ${planLabel.toLowerCase()} access has been renewed and reactivated.`,
    },
  };

  const selected = messageMap[emailType];
  if (!selected) throw new Error('Unsupported email type');

  const lines = [
    selected.intro,
    '',
    `Plan: ${planLabel}`,
    `Start date: ${startDate}`,
    `Expiry date: ${expiryDate}`,
    `Next billing date: ${nextBillingDate}`,
    `Total paid: ${totalPaid}`,
    `Amount due: ${amountDue}`,
  ];

  const text = `${selected.subject}\n\n${lines.join('\n')}`;
  const html = `
    <div style="font-family: Arial, sans-serif; color: #14213d; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">${selected.subject}</h2>
      <p>${selected.intro}</p>
      <table style="border-collapse: collapse; margin-top: 16px;">
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Plan</strong></td><td>${planLabel}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Start date</strong></td><td>${startDate}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Expiry date</strong></td><td>${expiryDate}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Next billing date</strong></td><td>${nextBillingDate}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Total paid</strong></td><td>${totalPaid}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Amount due</strong></td><td>${amountDue}</td></tr>
      </table>
      <p style="margin-top: 16px;">Thank you for choosing Tawjeeh Annotation.</p>
    </div>
  `;

  return {
    subject: selected.subject,
    html,
    text,
  };
}

export async function sendSubscriptionEmail({ userId, emailType, paymentRecordId = null }) {
  if (!EMAIL_TYPES.includes(emailType)) {
    throw new Error('Unsupported email type');
  }

  const summary = getSubscriptionSummary(userId);
  if (!summary?.subscription) {
    throw new Error('Subscription not found');
  }

  const settings = getSettings();
  const recipientEmail = summary.subscription.contactEmail || '';
  if (!recipientEmail) {
    logEmailAttempt({
      userId,
      subscriptionId: summary.subscription.id,
      paymentRecordId,
      emailType,
      recipientEmail: '(missing)',
      status: 'failed',
      errorMessage: 'No contact email configured for this subscription',
    });
    return { ok: false, error: 'No contact email configured for this subscription' };
  }

  const payment = paymentRecordId
    ? getDatabase().prepare('SELECT * FROM payment_records WHERE id = ?').get(paymentRecordId)
    : null;
  const emailContent = buildEmailContent(emailType, summary, payment ? parsePayment(payment) : null);
  const result = await sendTransactionalEmail({
    to: recipientEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    fromEmail: settings.resend_from_email,
    replyTo: settings.billing_reply_to_email || undefined,
  });

  logEmailAttempt({
    userId,
    subscriptionId: summary.subscription.id,
    paymentRecordId,
    emailType,
    recipientEmail,
    status: result.ok ? 'sent' : 'failed',
    errorMessage: result.error,
    resendMessageId: result.messageId,
  });

  return result;
}

function shouldSendLifecycleEmail(summary, emailType) {
  const db = getDatabase();
  const latest = db.prepare(`
    SELECT created_at
    FROM subscription_email_log
    WHERE user_id = ? AND email_type = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(summary.userId, emailType);

  if (!latest) return true;

  if (emailType === 'subscription_expiring') {
    return latest.created_at < (summary.subscription?.billingAnchorAt || 0);
  }

  if (emailType === 'subscription_expired') {
    return latest.created_at < (summary.subscription?.expiresAt || 0);
  }

  return false;
}

export async function processLifecycleEmails() {
  const summaries = listBillingUsers();
  const results = [];
  const currentTime = nowTs();

  for (const summary of summaries) {
    const subscription = summary.subscription;
    if (!subscription || subscription.planType === 'lifetime' || subscription.status !== 'active' || !subscription.expiresAt) {
      continue;
    }

    const expiresAt = subscription.expiresAt;
    if (isBefore(new Date(expiresAt), new Date(currentTime)) && shouldSendLifecycleEmail(summary, 'subscription_expired')) {
      results.push(await sendSubscriptionEmail({ userId: summary.userId, emailType: 'subscription_expired' }));
      continue;
    }

    const daysUntilExpiry = differenceInCalendarDays(new Date(expiresAt), new Date(currentTime));
    if (daysUntilExpiry >= 0 && daysUntilExpiry <= REMINDER_WINDOW_DAYS && shouldSendLifecycleEmail(summary, 'subscription_expiring')) {
      results.push(await sendSubscriptionEmail({ userId: summary.userId, emailType: 'subscription_expiring' }));
    }
  }

  return results;
}

export async function sendSubscriptionLifecycleEmailForUpdate(previousSummary, nextSummary) {
  if (!nextSummary?.subscription) return null;

  const prevActive = Boolean(previousSummary?.activeAccess);
  const nextActive = Boolean(nextSummary.activeAccess);
  const emailType = previousSummary?.subscription && !prevActive && nextActive
    ? 'subscription_reactivated'
    : 'subscription_activated';
  return sendSubscriptionEmail({ userId: nextSummary.userId, emailType });
}

export async function sendPaymentReceipt(userId, paymentRecordId) {
  return sendSubscriptionEmail({ userId, emailType: 'payment_receipt', paymentRecordId });
}
