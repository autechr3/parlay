import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

// Estedad (OFL, github.com/aminabedi68/Estedad): geometric low-contrast Persian
// face — reads "print-modern" where naskh-style faces read calligraphic.
const farsiFont = localFont({
  src: "../fonts/EstedadVariable.woff2",
  variable: "--font-farsi",
  weight: "100 900",
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
    <html lang="en" className={farsiFont.variable}>
      {/* Font var must sit on <html>: Tailwind's @theme emits
          --font-fa: var(--font-farsi) on :root, and custom properties resolve
          where declared — on <body> the var never reaches :root and every
          .font-fa silently falls back to Arial/naskh. */}
      <body className="antialiased"
        style={{ "--fa-scale": faScale } as React.CSSProperties}>
        {user && <Nav />}
        {children}
      </body>
    </html>
  );
}
