export async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev", to, subject, html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

export async function unsubscribeUrl(userId: string): Promise<string> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET")!;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${Deno.env.get("SITE_URL")}/api/unsubscribe?uid=${userId}&token=${hex}`;
}

// Persian content needs dir=rtl + webfont with legible fallback (spec §Daily reminder email)
export const FA_SPAN = (t: string) =>
  `<span dir="rtl" lang="fa" style="font-family:Vazirmatn,'Times New Roman',serif">${t}</span>`;
export const EMAIL_HEAD = `<link href="https://fonts.googleapis.com/css2?family=Vazirmatn&display=swap" rel="stylesheet">`;
