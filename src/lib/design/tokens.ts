// Parlay design tokens — the single source both the chat widgets (now) and the
// RN app (later) style from. Playful-but-grown-up: saturated teal/cobalt core,
// warm reward colors, big radii. Per-language accenting comes later via the
// languages config; these are the neutral core.

export type ThemeName = "light" | "dark";

export type Theme = {
  bg: string; surface: string; text: string; muted: string; border: string;
  primary: string; onPrimary: string; correct: string; incorrect: string; accent: string;
};

export const themes: Record<ThemeName, Theme> = {
  light: {
    bg: "#FBF7F0", surface: "#FFFFFF", text: "#1B2140", muted: "#6B7194", border: "#E4DFD4",
    primary: "#12B5AE", onPrimary: "#FFFFFF", correct: "#2FA36B", incorrect: "#E03A57", accent: "#F2A93B",
  },
  dark: {
    bg: "#10173A", surface: "#1A2350", text: "#F2EFE9", muted: "#9BA3C7", border: "#2C376B",
    primary: "#17C9C1", onPrimary: "#0B1030", correct: "#3FBF80", incorrect: "#F06078", accent: "#F5B95C",
  },
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const space = (n: number): number => n * 4;

export const font = {
  body: "'Figtree', 'Segoe UI', system-ui, sans-serif",
  display: "'Baloo 2', 'Figtree', 'Segoe UI', system-ui, sans-serif",
  script: "'Estedad', 'Vazirmatn', 'Segoe UI', Tahoma, sans-serif",
} as const;
