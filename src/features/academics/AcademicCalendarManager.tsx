"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";

interface AcademicYear {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: string;
}

interface AcademicTerm {
  id: string;
  academic_year_id: string;
  name: string;
  term_number: number;
  starts_on: string;
  ends_on: string;
  status: string;
}

interface Props {
  schoolId: string;
  canManage: boolean;
}

export default function AcademicCalendarManager({
  schoolId,
  canManage,
}: Props) {
  const supabase = useMemo(
    () => createClient(),
    []
  );

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);

  const [selectedYearId, setSelectedYearId] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Academic year form
  const [yearName, setYearName] = useState("");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");

  // Term form
  const [termName, setTermName] = useState("");
  const [termNumber, setTermNumber] = useState("1");
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");

  // Load academic information
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    const [yearsResponse, termsResponse] =
      await Promise.all([
        supabase
          .from("academic_years")
          .select(
            "id, name, starts_on, ends_on, status"
          )
          .eq("school_id", schoolId)
          .order("starts_on", {
            ascending: false,
          }),

        supabase
          .from("terms")
          .select(
            "id, academic_year_id, name, term_number, starts_on, ends_on, status"
          )
          .eq("school_id", schoolId)
          .order("term_number", {
            ascending: true,
          }),
      ]);

    if (yearsResponse.error || termsResponse.error) {
      setError(
        "Unable to load academic years and terms."
      );
      setLoading(false);
      return;
    }

    const loadedYears =
      (yearsResponse.data ?? []) as AcademicYear[];

    const loadedTerms =
      (termsResponse.data ?? []) as AcademicTerm[];

    setYears(loadedYears);
    setTerms(loadedTerms);

    setSelectedYearId((previous) => {
      if (loadedYears.some((year) => year.id === previous)) {
        return previous;
      }

      return loadedYears[0]?.id ?? "";
    });

    setLoading(false);
  }, [schoolId, supabase]);

    // =====================================================
    // INITIAL ACADEMIC CALENDAR DATA LOADING
    // =====================================================

    useEffect(() => {
      let cancelled = false;

      async function initializeCalendar() {
        try {
          const [yearsResponse, termsResponse] =
            await Promise.all([
              supabase
                .from("academic_years")
                .select(
                  "id, name, starts_on, ends_on, status"
                )
                .eq("school_id", schoolId)
                .order("starts_on", {
                  ascending: false,
                }),

              supabase
                .from("terms")
                .select(
                  "id, academic_year_id, name, term_number, starts_on, ends_on, status"
                )
                .eq("school_id", schoolId)
                .order("term_number", {
                  ascending: true,
                }),
            ]);

          if (cancelled) return;

          if (yearsResponse.error) {
            throw yearsResponse.error;
          }

          if (termsResponse.error) {
            throw termsResponse.error;
          }

          const loadedYears =
            (yearsResponse.data ?? []) as AcademicYear[];

          const loadedTerms =
            (termsResponse.data ?? []) as AcademicTerm[];

          setYears(loadedYears);

          setTerms(loadedTerms);

          setSelectedYearId((previous) => {
            const previousExists = loadedYears.some(
              (year) => year.id === previous
            );

            if (previousExists) {
              return previous;
            }

            return loadedYears[0]?.id ?? "";
          });
        } catch (error) {
          if (cancelled) return;

          console.error(
            "Academic calendar loading error:",
            error
          );

          setError(
            "Unable to load academic years and terms."
          );
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      }

      void initializeCalendar();

      return () => {
        cancelled = true;
      };
    }, [schoolId, supabase]);

  // Create academic year
  async function createAcademicYear(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!canManage || saving) return;

    setError("");
    setSuccess("");

    if (!yearName.trim() || !yearStart || !yearEnd) {
      setError("Complete all academic year fields.");
      return;
    }

    if (yearEnd <= yearStart) {
      setError("End date must be after start date.");
      return;
    }

    setSaving(true);

    const { error: insertError } = await supabase
      .from("academic_years")
      .insert({
        school_id: schoolId,
        name: yearName.trim(),
        starts_on: yearStart,
        ends_on: yearEnd,
      });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess("Academic year created successfully.");

    setYearName("");
    setYearStart("");
    setYearEnd("");

    await loadData();
  }

  // Create academic term
  async function createAcademicTerm(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!canManage || saving) return;

    setError("");
    setSuccess("");

    if (!selectedYearId) {
      setError("Select an academic year.");
      return;
    }

    if (!termName.trim() || !termStart || !termEnd) {
      setError("Complete all term fields.");
      return;
    }

    if (termEnd <= termStart) {
      setError("Term end date must be after start date.");
      return;
    }

    const selectedYear = years.find(
      (year) => year.id === selectedYearId
    );

    if (
      selectedYear &&
      (
        termStart < selectedYear.starts_on ||
        termEnd > selectedYear.ends_on
      )
    ) {
      setError("Term dates must fall within the academic year.");
      return;
    }

    setSaving(true);

    const { error: insertError } = await supabase
      .from("terms")
      .insert({
        school_id: schoolId,
        academic_year_id: selectedYearId,
        name: termName.trim(),
        term_number: Number(termNumber),
        starts_on: termStart,
        ends_on: termEnd,
      });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess("Academic term created successfully.");

    setTermName("");
    setTermStart("");
    setTermEnd("");

    await loadData();
  }

  const selectedYear = years.find(
    (year) => year.id === selectedYearId
  );

  const selectedTerms = terms.filter(
    (term) => term.academic_year_id === selectedYearId
  );

  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-slate-600">
        Loading academic calendar...
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Messages */}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-700"
        >
          {success}
        </div>
      )}

      {/* Academic Year Selection */}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-900">
            Academic Years
          </h2>

          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Refresh
          </button>
        </div>

        {years.length === 0 ? (
          <p className="text-slate-500">
            No academic years have been created.
          </p>
        ) : (
          <div>
            <label
              htmlFor="academicYear"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Select Academic Year
            </label>

            <select
              id="academicYear"
              value={selectedYearId}
              onChange={(event) =>
                setSelectedYearId(event.target.value)
              }
              className={inputClass}
            >
              {years.map((year) => (
                <option
                  key={year.id}
                  value={year.id}
                >
                  {year.name} — {year.status}
                </option>
              ))}
            </select>

            {selectedYear && (
              <div className="mt-5 rounded-xl bg-slate-50 p-5">
                <h3 className="font-bold text-slate-900">
                  {selectedYear.name}
                </h3>

                <p className="mt-2 text-sm text-slate-600">
                  {selectedYear.starts_on} to{" "}
                  {selectedYear.ends_on}
                </p>

                <p className="mt-2 text-sm capitalize text-blue-700">
                  Status: {selectedYear.status}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Terms */}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <h2 className="text-xl font-bold text-slate-900">
          Academic Terms
        </h2>

        {selectedTerms.length === 0 ? (
          <p className="mt-5 text-slate-500">
            No terms available for this academic year.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {selectedTerms.map((term) => (
              <div
                key={term.id}
                className="rounded-xl border border-slate-200 p-5"
              >
                <p className="text-xs font-semibold text-blue-700">
                  TERM {term.term_number}
                </p>

                <h3 className="mt-2 font-bold text-slate-900">
                  {term.name}
                </h3>

                <p className="mt-3 text-sm text-slate-600">
                  {term.starts_on}
                </p>

                <p className="text-sm text-slate-600">
                  {term.ends_on}
                </p>

                <span className="mt-4 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">
                  {term.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Management Forms */}

      {canManage && (
        <div className="grid gap-6 xl:grid-cols-2">

          {/* Create Academic Year */}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold text-slate-900">
              Create Academic Year
            </h2>

            <form
              onSubmit={createAcademicYear}
              className="mt-6 space-y-4"
            >
              <input
                required
                minLength={3}
                maxLength={100}
                placeholder="e.g. 2026/2027"
                value={yearName}
                onChange={(event) =>
                  setYearName(event.target.value)
                }
                className={inputClass}
              />

              <div>
                <label
                  htmlFor="yearStart"
                  className="mb-2 block text-sm text-slate-600"
                >
                  Start Date
                </label>

                <input
                  id="yearStart"
                  required
                  type="date"
                  value={yearStart}
                  onChange={(event) =>
                    setYearStart(event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="yearEnd"
                  className="mb-2 block text-sm text-slate-600"
                >
                  End Date
                </label>

                <input
                  id="yearEnd"
                  required
                  type="date"
                  value={yearEnd}
                  onChange={(event) =>
                    setYearEnd(event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Create Academic Year"}
              </button>
            </form>
          </section>

          {/* Create Term */}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold text-slate-900">
              Create Academic Term
            </h2>

            <form
              onSubmit={createAcademicTerm}
              className="mt-6 space-y-4"
            >
              <input
                required
                minLength={2}
                maxLength={100}
                placeholder="e.g. First Term"
                value={termName}
                onChange={(event) =>
                  setTermName(event.target.value)
                }
                className={inputClass}
              />

              <select
                value={termNumber}
                onChange={(event) =>
                  setTermNumber(event.target.value)
                }
                className={inputClass}
              >
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
                <option value="4">Term 4</option>
              </select>

              <div>
                <label
                  htmlFor="termStart"
                  className="mb-2 block text-sm text-slate-600"
                >
                  Start Date
                </label>

                <input
                  id="termStart"
                  required
                  type="date"
                  value={termStart}
                  onChange={(event) =>
                    setTermStart(event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="termEnd"
                  className="mb-2 block text-sm text-slate-600"
                >
                  End Date
                </label>

                <input
                  id="termEnd"
                  required
                  type="date"
                  value={termEnd}
                  onChange={(event) =>
                    setTermEnd(event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={saving || !selectedYearId}
                className="w-full rounded-xl bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Create Term"}
              </button>
            </form>
          </section>

        </div>
      )}

    </div>
  );
}