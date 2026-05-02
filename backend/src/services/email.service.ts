import nodemailer from 'nodemailer';

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

export const emailService = {
  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const transport = createTransport();
    const from = process.env.SMTP_FROM ?? 'noreply@tef-canada.app';

    const info = await transport.sendMail({
      from,
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
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('[email] Password reset link (dev):', resetUrl);
      if ((info as any).message) {
        console.log('[email] Preview:', nodemailer.getTestMessageUrl(info));
      }
    }
  },
};
