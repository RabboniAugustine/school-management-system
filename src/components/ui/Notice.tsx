export default function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>;
  if (ok) return <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{ok}</p>;
  return null;
}
