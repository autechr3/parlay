import type { CSSProperties, ReactNode } from "react";

// RN-shaped primitives. Components written against these port to React Native
// by reimplementing this module with View/Text/Pressable/TextInput.
type BaseProps = { style?: CSSProperties; children?: ReactNode };

export function View({ style, children, dir }: BaseProps & { dir?: "rtl" | "ltr" }) {
  return <div dir={dir} style={style}>{children}</div>;
}

export function Text({ style, children, lang, dir }: BaseProps & { lang?: string; dir?: "rtl" | "ltr" }) {
  return <span lang={lang} dir={dir} style={style}>{children}</span>;
}

export function Pressable({ style, children, onPress, disabled, ariaLabel, preventFocusSteal }: BaseProps & {
  onPress: () => void; disabled?: boolean; ariaLabel?: string; preventFocusSteal?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onPress}
      onMouseDown={preventFocusSteal ? (e) => e.preventDefault() : undefined}
      style={{ cursor: disabled ? "default" : "pointer", border: "none", background: "none", padding: 0, font: "inherit", ...style }}
    >
      {children}
    </button>
  );
}

export function TextInputBox({ value, onChange, onSubmit, dir, style, ariaLabel }: {
  value: string; onChange: (v: string) => void; onSubmit?: () => void;
  dir?: "rtl" | "ltr"; style?: CSSProperties; ariaLabel?: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      dir={dir}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && onSubmit) onSubmit(); }}
      style={style}
    />
  );
}
