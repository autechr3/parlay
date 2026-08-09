import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const vazirmatn = localFont({
  src: "../fonts/Vazirmatn[wght].woff2",
  variable: "--font-fa",
  display: "swap",
});

export const metadata: Metadata = { title: "Farsi Tracker" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${vazirmatn.variable} antialiased`}>{children}</body>
    </html>
  );
}
