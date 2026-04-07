export async function sendTransactionalEmail({
  to,
  subject,
  html,
  text,
  fromEmail,
  replyTo,
}) {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY is not configured', messageId: null };
  }

  if (!fromEmail) {
    return { ok: false, error: 'resend_from_email is not configured', messageId: null };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: Array.isArray(to) ? to : [to],
        reply_to: replyTo || undefined,
        subject,
        html,
        text,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: payload?.message || payload?.error || 'Failed to send email through Resend',
        messageId: null,
      };
    }

    return { ok: true, messageId: payload?.id || null, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to send email through Resend',
      messageId: null,
    };
  }
}
