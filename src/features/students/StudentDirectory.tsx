"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

type Student = {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  status: string;
};

const PAGE_SIZE = 20;

interface Props {
  schoolId: string;
  slug: string;
  canManage: boolean;
}

export default function StudentDirectory({
  schoolId,
  slug,
  canManage,
}: Props) {
  const db = useMemo(() => createClient(), []);

  const [students, setStudents] = useState<Student[]>([]);

  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    let request = db
      .from("students")
      .select(
        "id,admission_number,first_name,last_name,status",
        { count: "exact" }
      )
      .eq("school_id", schoolId);

    // Remove PostgREST filter control characters.
    const clean = query
      .replace(/[,().%_\\]/g, "")
      .slice(0, 64)
      .trim();

    if (clean) {
      request = request.or(
        `first_name.ilike.%${clean}%,last_name.ilike.%${clean}%,admission_number.ilike.%${clean}%`
      );
    }

    const {
      data,
      count,
      error: queryError,
    } = await request
      .order("last_name")
      .range(
        page * PAGE_SIZE,
        (page + 1) * PAGE_SIZE - 1
      );

    if (queryError) {
      setError("Unable to load students.");
    } else {
      setStudents((data ?? []) as Student[]);
      setTotal(count ?? 0);
    }

    setLoading(false);
  }, [db, schoolId, query, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const base =
    `/schools/${encodeURIComponent(slug)}/students`;

  function search(event: FormEvent) {
    event.preventDefault();

    setPage(0);
    setQuery(draft);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={search}
          className="flex flex-1 gap-2"
        >
          <input
            aria-label="Search students"
            className="min-w-0 flex-1 rounded-xl border px-4 py-3"
            value={draft}
            onChange={(event) =>
              setDraft(event.target.value)
            }
            placeholder="Search name or admission number"
          />

          <button className="rounded-lg bg-blue-800 px-5 py-3 font-semibold text-white">
            Search
          </button>
        </form>

        {canManage && (
          <Link
            href={`${base}/register`}
            className="rounded-lg bg-green-700 px-5 py-3 font-semibold text-white"
          >
            + Register Student
          </Link>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-4 text-red-700"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-5 py-4">Admission</th>
              <th className="px-5 py-4">Student</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Profile</th>
            </tr>
          </thead>

          <tbody>
            {students.map((student) => (
              <tr
                key={student.id}
                className="border-t"
              >
                <td className="px-5 py-4">
                  {student.admission_number}
                </td>

                <td className="px-5 py-4 font-semibold">
                  {student.first_name} {student.last_name}
                </td>

                <td className="px-5 py-4 capitalize">
                  {student.status}
                </td>

                <td className="px-5 py-4">
                  <Link
                    className="font-semibold text-blue-700"
                    href={`${base}/${student.id}`}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && students.length === 0 && (
          <p className="p-6 text-slate-500">
            No matching students.
          </p>
        )}

        {loading && (
          <p className="p-6 text-slate-500">
            Loading...
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>
          {total} records · Page {page + 1}
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() =>
              setPage((previous) =>
                Math.max(0, previous - 1)
              )
            }
            className="rounded-lg border px-4 py-2 disabled:opacity-40"
          >
            Previous
          </button>

          <button
            type="button"
            disabled={
              (page + 1) * PAGE_SIZE >= total ||
              loading
            }
            onClick={() =>
              setPage((previous) => previous + 1)
            }
            className="rounded-lg border px-4 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}