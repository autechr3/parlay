import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

// No brackets in the font filename: Vercel treats [wght] in a static-asset URL
// as a dynamic-route segment and 404s it, silently degrading Farsi to serif.
const vazirmatn = localFont({
  src: "../fonts/VazirmatnVariable.woff2",
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = { title: "Farsi Tracker" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let faScale = 1.25;  // logged-out fallback, keep in sync with globals.css
  if (user) {
    const { data: p } = await supabase.from("profiles")
      .select("fa_scale").eq("id", user.id).maybeSingle();
    if (p?.fa_scale) faScale = p.fa_scale / 100;
  }
  return (
    <html lang="en">
      <body className={`${vazirmatn.variable} antialiased`}
        style={{ "--fa-scale": faScale } as React.CSSProperties}>
        {user && <Nav />}
        {children}
      </body>
    </html>
  );
}
