import { createContext, useContext, type ReactNode } from "react";
import { themes, type Theme } from "../../lib/design/tokens";

const ThemeCtx = createContext<Theme>(themes.light);
export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}
export function useTheme(): Theme {
  return useContext(ThemeCtx);
}
