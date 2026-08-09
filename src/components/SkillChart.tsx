"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

export function SkillChart({ data, skills }:
  { data: Record<string, string | number>[]; skills: string[] }) {
  const palette = ["#000", "#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed",
    "#0891b2", "#be185d", "#4d7c0f", "#b45309", "#6b7280"];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <XAxis dataKey="date" fontSize={11} /><YAxis domain={[1, 5]} ticks={[1,2,3,4,5]} fontSize={11} />
        <Tooltip /><Legend />
        {skills.map((s, i) => (
          <Line key={s} dataKey={s} stroke={palette[i % palette.length]} connectNulls dot />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
