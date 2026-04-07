import {
  createDemoRequest,
  getPublicMarketingSettings,
  getSettings,
  getSubscriptionSummary,
  listBillingUsers,
  listDemoRequests,
  listEmailLogs,
  processLifecycleEmails,
  recordPayment,
  sendPaymentReceipt,
  sendSubscriptionEmail,
  sendSubscriptionLifecycleEmailForUpdate,
  updateDemoRequestStatus,
  updateSettings,
  upsertSubscription,
} from '../services/billingService.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

export function registerBillingRoutes(app) {
  app.get('/api/public/marketing-settings', (_req, res) => {
    res.json(getPublicMarketingSettings());
  });

  app.post('/api/demo-requests', (req, res) => {
    try {
      const result = createDemoRequest(req.body || {});
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to submit demo request' });
    }
  });

  app.get('/api/billing/overview', requireAuth, requireSuperAdmin, (req, res) => {
    res.json({
      users: listBillingUsers(),
      settings: {
        calendlyUrl: getSettings().calendly_url || '',
        resendFromEmail: getSettings().resend_from_email || '',
        billingReplyToEmail: getSettings().billing_reply_to_email || '',
      },
      demoRequests: listDemoRequests(),
      emailLogs: listEmailLogs({ limit: 50 }),
    });
  });

  app.get('/api/billing/users', requireAuth, requireSuperAdmin, (_req, res) => {
    res.json(listBillingUsers());
  });

  app.get('/api/billing/subscriptions/:userId', requireAuth, requireSuperAdmin, (req, res) => {
    const summary = getSubscriptionSummary(req.params.userId);
    if (!summary) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(summary);
  });

  app.put('/api/billing/subscriptions/:userId', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const previousSummary = getSubscriptionSummary(req.params.userId);
      const summary = upsertSubscription(req.params.userId, req.body || {}, req.user.id);
      sendSubscriptionLifecycleEmailForUpdate(previousSummary, summary).catch((error) => {
        console.error('Failed to send subscription email:', error);
      });
      res.json(summary);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update subscription' });
    }
  });

  app.post('/api/billing/payments', requireAuth, requireSuperAdmin, (req, res) => {
    try {
      const userId = String(req.body?.userId || '').trim();
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const result = recordPayment(userId, req.body || {}, req.user.id);
      sendPaymentReceipt(userId, result.payment.id).catch((error) => {
        console.error('Failed to send payment receipt:', error);
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to record payment' });
    }
  });

  app.get('/api/billing/settings', requireAuth, requireSuperAdmin, (_req, res) => {
    const settings = getSettings();
    res.json({
      calendlyUrl: settings.calendly_url || '',
      resendFromEmail: settings.resend_from_email || '',
      billingReplyToEmail: settings.billing_reply_to_email || '',
    });
  });

  app.put('/api/billing/settings', requireAuth, requireSuperAdmin, (req, res) => {
    res.json(updateSettings(req.body || {}, req.user.id));
  });

  app.get('/api/billing/demo-requests', requireAuth, requireSuperAdmin, (_req, res) => {
    res.json(listDemoRequests());
  });

  app.patch('/api/billing/demo-requests/:id', requireAuth, requireSuperAdmin, (req, res) => {
    try {
      const updated = updateDemoRequestStatus(req.params.id, req.body?.status);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update demo request' });
    }
  });

  app.get('/api/billing/email-logs', requireAuth, requireSuperAdmin, (req, res) => {
    res.json(listEmailLogs({ userId: req.query.userId || null, limit: req.query.limit || 100 }));
  });

  app.post('/api/billing/emails/process-lifecycle', requireAuth, requireSuperAdmin, async (_req, res) => {
    const results = await processLifecycleEmails();
    res.json({ processed: results.length });
  });

  app.post('/api/billing/emails/resend', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const userId = String(req.body?.userId || '').trim();
      const emailType = String(req.body?.emailType || '').trim();
      const paymentRecordId = req.body?.paymentRecordId ? String(req.body.paymentRecordId) : null;

      if (!userId || !emailType) {
        return res.status(400).json({ error: 'userId and emailType are required' });
      }

      const result = await sendSubscriptionEmail({ userId, emailType, paymentRecordId });
      if (!result.ok) {
        return res.status(400).json({ error: result.error || 'Failed to resend email' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to resend email' });
    }
  });
}

export default { registerBillingRoutes };
