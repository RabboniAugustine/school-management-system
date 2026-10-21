"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

import AcademicCalendarManager from "@/features/academics/AcademicCalendarManager";

type Year = {
  id: string;
  name: string;
  status: string;
};

type Term = {
  id: string;
  academic_year_id: string;
  name: string;
  status: string;
};

interface Props {
  schoolId: string;
  canManage: boolean;
}

export default function AcademicYearsWorkspace({
  schoolId,
  canManage,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [years, setYears] = useState<Year[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);

  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");

  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [yearsResponse, termsResponse] = await Promise.all([
      supabase
        .from("academic_years")
        .select("id,name,status")
        .eq("school_id", schoolId)
        .order("name"),

      supabase
        .from("terms")
        .select("id,academic_year_id,name,status")
        .eq("school_id", schoolId)
        .order("term_number"),
    ]);

    if (yearsResponse.error || termsResponse.error) {
      setMessage("Unable to load activation controls.");
      return;
    }

    const loadedYears = (yearsResponse.data ?? []) as Year[];
    const loadedTerms = (termsResponse.data ?? []) as Term[];

    setYears(loadedYears);
    setTerms(loadedTerms);

    setYearId((previous) => {
      const exists = loadedYears.some(
        (year) => year.id === previous
      );

      return exists ? previous : (loadedYears[0]?.id ?? "");
    });
  }, [schoolId, supabase]);

  // Schedule asynchronous loading after effect setup.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [load, revision]);

  const termOptions = terms.filter(
    (term) => term.academic_year_id === yearId
  );

  async function activate(kind: "year" | "term") {
    if (!canManage || busy) return;

    const id = kind === "year" ? yearId : termId;

    if (!id) {
      setMessage("Select a record first.");
      return;
    }

    const confirmed = window.confirm(
      `Activate this ${kind}? The previously active ${kind} will be completed.`
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    const { error } =
      kind === "year"
        ? await supabase.rpc("activate_academic_year", {
            p_school_id: schoolId,
            p_year_id: id,
          })
        : await supabase.rpc("activate_academic_term", {
            p_school_id: schoolId,
            p_term_id: id,
          });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      `${kind === "year" ? "Academic year" : "Term"} activated.`
    );

    setRevision((previous) => previous + 1);
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
          <h2 className="text-xl font-bold text-slate-900">
            Activate Academic Calendar
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            Complete the required year and term records
            before activation.
          </p>

          {message && (
            <p
              role="status"
              className="mt-3 rounded-lg bg-white p-3 text-sm"
            >
              {message}
            </p>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <label
                htmlFor="activate-year"
                className="block text-sm font-semibold"
              >
                Academic Year
              </label>

              <select
                id="activate-year"
                className="w-full rounded-lg border p-3"
                value={yearId}
                onChange={(event) => {
                  setYearId(event.target.value);
                  setTermId("");
                }}
              >
                <option value="">Select year</option>

                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name} ({year.status})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void activate("year")}
                disabled={busy || !yearId}
                className="rounded-lg bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-40"
              >
                Activate Year
              </button>
            </div>

            <div className="space-y-3">
              <label
                htmlFor="activate-term"
                className="block text-sm font-semibold"
              >
                Term
              </label>

              <select
                id="activate-term"
                className="w-full rounded-lg border p-3"
                value={termId}
                onChange={(event) =>
                  setTermId(event.target.value)
                }
              >
                <option value="">Select term</option>

                {termOptions.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name} ({term.status})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void activate("term")}
                disabled={busy || !termId}
                className="rounded-lg bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-40"
              >
                Activate Term
              </button>
            </div>
          </div>
        </section>
      )}

      <AcademicCalendarManager
        key={revision}
        schoolId={schoolId}
        canManage={canManage}
      />
    </div>
  );
}