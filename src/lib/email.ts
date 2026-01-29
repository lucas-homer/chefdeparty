import { Resend } from "resend";

// Note: Resend instance is created per-request in edge runtime
// since we need to access env vars at runtime
export function createResend(apiKey: string) {
  return new Resend(apiKey);
}

interface SendInviteEmailParams {
  resend: Resend;
  to: string;
  guestName?: string;
  partyName: string;
  partyDate: Date;
  partyLocation?: string | null;
  partyDescription?: string | null;
  inviteUrl: string;
  hostName?: string;
}

export async function sendInviteEmail({
  resend,
  to,
  guestName,
  partyName,
  partyDate,
  partyLocation,
  partyDescription,
  inviteUrl,
  hostName,
}: SendInviteEmailParams) {
  const formattedDate = partyDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = partyDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const greeting = guestName ? `Hi ${guestName},` : "Hi,";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #000; font-size: 28px; margin-bottom: 10px;">You're Invited!</h1>
  </div>

  <p style="font-size: 16px; margin-bottom: 20px;">${greeting}</p>

  <p style="font-size: 16px; margin-bottom: 20px;">
    ${hostName ? `${hostName} has` : "You've been"} invited you to <strong>${partyName}</strong>!
  </p>

  ${partyDescription ? `<p style="font-size: 16px; margin-bottom: 20px; color: #666;">${partyDescription}</p>` : ""}

  <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
    <p style="margin: 0 0 10px 0; font-size: 16px;">
      <strong>When:</strong> ${formattedDate} at ${formattedTime}
    </p>
    ${partyLocation ? `<p style="margin: 0; font-size: 16px;"><strong>Where:</strong> ${partyLocation}</p>` : ""}
  </div>

  <div style="text-align: center; margin-bottom: 30px;">
    <a href="${inviteUrl}" style="display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 16px; font-weight: 500;">
      RSVP Now
    </a>
  </div>

  <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
    Or copy this link: <a href="${inviteUrl}" style="color: #666;">${inviteUrl}</a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 12px; color: #999; text-align: center;">
    Sent via <a href="https://chefde.party" style="color: #999;">ChefDeParty</a>
  </p>
</body>
</html>
  `.trim();

  const text = `
${greeting}

${hostName ? `${hostName} has` : "You've been"} invited you to ${partyName}!

${partyDescription ? partyDescription + "\n" : ""}
When: ${formattedDate} at ${formattedTime}
${partyLocation ? `Where: ${partyLocation}` : ""}

RSVP at: ${inviteUrl}

---
Sent via ChefDeParty (https://chefde.party)
  `.trim();

  const result = await resend.emails.send({
    from: "ChefDeParty <hello@chefde.party>",
    to,
    subject: `You're invited to ${partyName}!`,
    html,
    text,
  });

  return result;
}

interface SendReminderEmailParams {
  resend: Resend;
  to: string;
  guestName?: string;
  partyName: string;
  partyDate: Date;
  partyLocation?: string | null;
  inviteUrl: string;
  daysUntil: number;
}

export async function sendReminderEmail({
  resend,
  to,
  guestName,
  partyName,
  partyDate,
  partyLocation,
  inviteUrl,
  daysUntil,
}: SendReminderEmailParams) {
  const formattedDate = partyDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const formattedTime = partyDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const greeting = guestName ? `Hi ${guestName},` : "Hi,";
  const timePhrase = daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reminder: ${partyName}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #000; font-size: 28px; margin-bottom: 10px;">Reminder</h1>
  </div>

  <p style="font-size: 16px; margin-bottom: 20px;">${greeting}</p>

  <p style="font-size: 16px; margin-bottom: 20px;">
    Just a friendly reminder that <strong>${partyName}</strong> is ${timePhrase}!
  </p>

  <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
    <p style="margin: 0 0 10px 0; font-size: 16px;">
      <strong>When:</strong> ${formattedDate} at ${formattedTime}
    </p>
    ${partyLocation ? `<p style="margin: 0; font-size: 16px;"><strong>Where:</strong> ${partyLocation}</p>` : ""}
  </div>

  <div style="text-align: center; margin-bottom: 30px;">
    <a href="${inviteUrl}" style="display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 16px; font-weight: 500;">
      View Details
    </a>
  </div>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 12px; color: #999; text-align: center;">
    Sent via <a href="https://chefde.party" style="color: #999;">ChefDeParty</a>
  </p>
</body>
</html>
  `.trim();

  const text = `
${greeting}

Just a friendly reminder that ${partyName} is ${timePhrase}!

When: ${formattedDate} at ${formattedTime}
${partyLocation ? `Where: ${partyLocation}` : ""}

View details: ${inviteUrl}

---
Sent via ChefDeParty (https://chefde.party)
  `.trim();

  const result = await resend.emails.send({
    from: "ChefDeParty <hello@chefde.party>",
    to,
    subject: `Reminder: ${partyName} is ${timePhrase}!`,
    html,
    text,
  });

  return result;
}
