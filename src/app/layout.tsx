import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

// Estedad (OFL, github.com/aminabedi68/Estedad): geometric low-contrast Persian
// face — reads "print-modern" where naskh-style faces read calligraphic.
const estedad = localFont({
  src: "../fonts/EstedadVariable.woff2",
  variable: "--font-estedad",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = { title: "Parlay" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let scriptScale = 1.25;  // logged-out fallback, keep in sync with globals.css
  let showSetupGuide = false;
  if (user) {
    const { data: p } = await supabase.from("profiles")
      .select("script_scale, onboarded_at").eq("id", user.id).maybeSingle();
    if (p?.script_scale) scriptScale = p.script_scale / 100;
    showSetupGuide = !p?.onboarded_at;
  }
  return (
    <html lang="en" className={estedad.variable}>
      {/* Font var must sit on <html>: Tailwind's @theme emits
          --font-script: var(--font-estedad) on :root, and custom properties resolve
          where declared — on <body> the var never reaches :root and every
          .font-script silently falls back to Arial/naskh. */}
      <body className="antialiased"
        style={{ "--script-scale": scriptScale } as React.CSSProperties}>
        {user && <Nav showSetupGuide={showSetupGuide} />}
        {children}
      </body>
    </html>
  );
}
