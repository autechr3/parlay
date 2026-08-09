export function Heatmap({ days }: { days: { day: string; count: number }[] }) {
  const byDay = new Map(days.map((d) => [d.day, d.count]));
  const cells: { key: string; count: number }[] = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ key, count: byDay.get(key) ?? 0 });
  }
  const shade = (c: number) =>
    c === 0 ? "bg-gray-100" : c < 10 ? "bg-green-200" : c < 40 ? "bg-green-400" : "bg-green-600";
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1" title="last 90 days">
      {cells.map((c) => (
        <div key={c.key} title={`${c.key}: ${c.count}`} className={`h-3 w-3 rounded-sm ${shade(c.count)}`} />
      ))}
    </div>
  );
}
