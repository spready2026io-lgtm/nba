// Verification email sender. Uses Resend's plain HTTPS API when RESEND_API_KEY is
// set; otherwise returns the link so the UI can show it (dev fallback, decision
// 2026-08-30: full flow built now, key added to Vercel env later, no code change).
//
// Note for go-live: until hoopsai.com is verified in Resend, the resend.dev sender
// can only deliver to the Resend account owner's own address.

export type MailResult = { sent: true } | { sent: false; devLink: string; reason: string };

export async function sendVerificationEmail(email: string, link: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mailer] RESEND_API_KEY not set. Verification link for ${email}: ${link}`);
    return { sent: false, devLink: link, reason: 'no-api-key' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? 'HoopsAi <onboarding@resend.dev>',
        to: [email],
        subject: 'Verify your HoopsAi account',
        text:
          `Welcome to HoopsAi.\n\n` +
          `Confirm your email address to activate your account:\n${link}\n\n` +
          `By verifying you approve receiving email from HoopsAi. ` +
          `If you did not register, ignore this message.`,
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      console.error(`[mailer] Resend refused (${r.status}): ${body}`);
      return { sent: false, devLink: link, reason: `resend-${r.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error('[mailer] send failed:', e);
    return { sent: false, devLink: link, reason: 'network-error' };
  }
}
