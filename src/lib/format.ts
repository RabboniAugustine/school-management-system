/** Money is stored as integer pesewas (1 GHS = 100 pesewas). */
export function ghs(pesewas: number | string | null | undefined): string {
  const n = Number(pesewas ?? 0) / 100;
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Parses a GHS amount typed by a person ("1,250.50") into pesewas. Returns null when invalid. */
export function toPesewas(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Math.round(parseFloat(cleaned) * 100);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function today(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Friendly message for database errors raised by our constraints and triggers. */
export function dbMessage(error: { message?: string; code?: string } | null | undefined, fallback = "Something went wrong."): string {
  if (!error) return fallback;
  if (error.code === "42501") return "You do not have permission to do that.";
  if (error.code === "23505") return "That record already exists.";
  if (error.code === "23503") return "A related record is missing or still in use.";
  if (error.code === "23514" && error.message) return error.message;
  if (error.code === "P0002" && error.message) return error.message;
  if (error.code === "22023" && error.message) return error.message;
  return fallback;
}

/** Escapes text before putting it into an HTML string for printing. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Opens a print-ready document in a new window. */
export function printHtml(title: string, bodyHtml: string): void {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;color:#0f172a;margin:32px;font-size:14px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:20px 0 6px}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#f1f5f9}
.r{text-align:right}.muted{color:#64748b}.row{display:flex;justify-content:space-between;gap:16px}@media print{button{display:none}}</style></head>
<body>${bodyHtml}<p><button onclick="window.print()">Print</button></p></body></html>`);
  w.document.close();
}

/** Builds a CSV string. Text cells that start with = + - @ are prefixed so spreadsheets cannot run them as formulas. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Downloads text as a CSV file (UTF-8 with BOM so Excel shows names correctly). */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const blob = new Blob(["\uFEFF", toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Pesewas as a plain decimal string for accounting files ("1250.50"). */
export function money2(pesewas: number): string {
  return (pesewas / 100).toFixed(2);
}
