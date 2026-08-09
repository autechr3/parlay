export function Fa({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="rtl" lang="fa" className={`font-fa ${className}`}>
      {children}
    </span>
  );
}
