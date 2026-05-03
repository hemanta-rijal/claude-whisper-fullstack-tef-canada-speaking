import nodemailer from 'nodemailer';

type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendViaMailtrap(token: string, from: string, payload: MailPayload): Promise<void> {
  const inboxId = process.env.MAILTRAP_INBOX_ID;
  // Sandbox (testing) uses a different endpoint and requires an inbox ID.
  const url = inboxId
    ? `https://sandbox.api.mailtrap.io/api/send/${inboxId}`
    : 'https://send.api.mailtrap.io/api/send';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: from, name: 'TEF Canada' },
      to: [{ email: payload.to }],
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailtrap API error ${res.status}: ${body}`);
  }
}

async function sendViaSmtp(payload: MailPayload & { from: string }): Promise<void> {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  await transport.sendMail(payload);
}

async function sendViaStream(payload: MailPayload & { from: string }, logLabel: string, url: string): Promise<void> {
  const transport = nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
  await transport.sendMail(payload);
  console.log(`[email] ${logLabel} (no transport configured):`, url);
}

async function send(payload: MailPayload, logLabel: string, url: string): Promise<void> {
  const from = process.env.SMTP_FROM ?? 'noreply@tef-canada.app';
  const mailtrapToken = process.env.MAILTRAP_TOKEN;
  const smtpReady = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (mailtrapToken) {
    await sendViaMailtrap(mailtrapToken, from, payload);
  } else if (smtpReady) {
    await sendViaSmtp({ ...payload, from });
  } else {
    await sendViaStream({ ...payload, from }, logLabel, url);
  }
}

export const emailService = {
  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    await send(
      {
        to,
        subject: 'Verify your TEF Canada email address',
        text: `Welcome to TEF Canada!\n\nClick the link below to verify your email address (expires in 24 hours):\n\n${verifyUrl}\n\nIf you did not create an account, you can safely ignore this email.`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#020617;color:#f1f5f9;padding:32px;border-radius:16px">
            <div style="margin-bottom:24px">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:12px">
                <svg width="22" height="22" fill="#818cf8" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
              </div>
            </div>
            <h1 style="font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:8px">Verify your email</h1>
            <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin-bottom:28px">
              Thanks for signing up for TEF Canada! Click the button below to verify your email address. This link expires in <strong style="color:#f1f5f9">24 hours</strong>.
            </p>
            <a href="${verifyUrl}" style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:12px;margin-bottom:28px">
              Verify email address
            </a>
            <p style="color:#64748b;font-size:12px;line-height:1.6">
              If you did not create an account, you can safely ignore this email.
            </p>
            <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0"/>
            <p style="color:#64748b;font-size:11px">TEF Canada Speaking Practice &mdash; Powered by OpenAI &amp; Anthropic</p>
          </div>
        `,
      },
      'Verification link',
      verifyUrl,
    );
  },

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    await send(
      {
        to,
        subject: 'Reset your TEF Canada password',
        text: `You requested a password reset.\n\nClick the link below to set a new password (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#020617;color:#f1f5f9;padding:32px;border-radius:16px">
            <div style="margin-bottom:24px">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:12px">
                <svg width="22" height="22" fill="#818cf8" viewBox="0 0 24 24"><path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6 10a6 6 0 0 1-12 0H4a8 8 0 0 0 16 0h-2zm-7 8v2H9v2h6v-2h-2v-2h-2z"/></svg>
              </div>
            </div>
            <h1 style="font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:8px">Reset your password</h1>
            <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin-bottom:28px">
              You requested a password reset for your TEF Canada account. Click the button below to set a new password. This link expires in <strong style="color:#f1f5f9">1 hour</strong>.
            </p>
            <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:12px;margin-bottom:28px">
              Reset password
            </a>
            <p style="color:#64748b;font-size:12px;line-height:1.6">
              If you did not request this, you can safely ignore this email. Your password will not change.
            </p>
            <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0"/>
            <p style="color:#64748b;font-size:11px">TEF Canada Speaking Practice &mdash; Powered by OpenAI &amp; Anthropic</p>
          </div>
        `,
      },
      'Password reset link',
      resetUrl,
    );
  },
};
