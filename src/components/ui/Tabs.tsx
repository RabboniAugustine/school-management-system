"use client";

export default function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${value === t.id ? "bg-blue-800 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
