"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";

type Subject = {
  id: string;
  code: string;
  name: string;
  is_core: boolean;
  is_active: boolean;
};

type SchoolClass = {
  id: string;
  name: string;
  code: string;
};

type Assignment = {
  id: string;
  class_id: string;
  subject_id: string;
};

const input =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5";

interface Props {
  schoolId: string;
  canManage: boolean;
}

export default function SubjectManager({
  schoolId,
  canManage,
}: Props) {
  const db = useMemo(() => createClient(), []);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [assignments, setAssignments] =
    useState<Assignment[]>([]);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [core, setCore] = useState(true);

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [
      subjectsResponse,
      classesResponse,
      assignmentsResponse,
    ] = await Promise.all([
      db
        .from("school_subjects")
        .select("id,code,name,is_core,is_active")
        .eq("school_id", schoolId)
        .order("name"),

      db
        .from("school_classes")
        .select("id,name,code")
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .order("name"),

      db
        .from("class_subjects")
        .select("id,class_id,subject_id")
        .eq("school_id", schoolId),
    ]);

    if (
      subjectsResponse.error ||
      classesResponse.error ||
      assignmentsResponse.error
    ) {
      setError("Unable to load subject records.");
      return;
    }

    const loadedSubjects =
      (subjectsResponse.data ?? []) as Subject[];

    const loadedClasses =
      (classesResponse.data ?? []) as SchoolClass[];

    setSubjects(loadedSubjects);
    setClasses(loadedClasses);

    setAssignments(
      (assignmentsResponse.data ?? []) as Assignment[]
    );

    setClassId(
      (previous) =>
        previous || (loadedClasses[0]?.id ?? "")
    );

    setSubjectId(
      (previous) =>
        previous || (loadedSubjects[0]?.id ?? "")
    );
  }, [db, schoolId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  async function addSubject(event: FormEvent) {
    event.preventDefault();

    if (!canManage || saving) return;

    setSaving(true);
    setError("");
    setNotice("");

    const { error: insertError } = await db
      .from("school_subjects")
      .insert({
        school_id: schoolId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        is_core: core,
      });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Subject added.");

    setName("");
    setCode("");

    await load();
  }

  async function assign(event: FormEvent) {
    event.preventDefault();

    if (!canManage || saving) return;

    setSaving(true);
    setError("");
    setNotice("");

    const { error: insertError } = await db
      .from("class_subjects")
      .insert({
        school_id: schoolId,
        class_id: classId,
        subject_id: subjectId,
      });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Subject assigned to class.");

    await load();
  }

  async function remove(id: string) {
    if (!canManage) return;

    const confirmed = window.confirm(
      "Remove this class assignment?"
    );

    if (!confirmed) return;

    const { error: deleteError } = await db
      .from("class_subjects")
      .delete()
      .eq("id", id)
      .eq("school_id", schoolId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setNotice("Assignment removed.");

    await load();
  }

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-4 text-red-700"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-lg bg-green-50 p-4 text-green-700"
        >
          {notice}
        </p>
      )}

      {canManage && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Create Subject */}

          <form
            onSubmit={(event) => void addSubject(event)}
            className="space-y-3 rounded-2xl border bg-white p-6"
          >
            <h2 className="text-lg font-bold">
              Create Subject
            </h2>

            <input
              aria-label="Subject code"
              required
              pattern="[A-Za-z0-9_-]{2,30}"
              className={input}
              placeholder="Code (e.g. MATH)"
              value={code}
              onChange={(event) =>
                setCode(event.target.value)
              }
            />

            <input
              aria-label="Subject name"
              required
              minLength={2}
              maxLength={120}
              className={input}
              placeholder="Subject name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
            />

            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={core}
                onChange={(event) =>
                  setCore(event.target.checked)
                }
              />

              Core subject
            </label>

            <button
              disabled={saving}
              className="rounded-lg bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-40"
            >
              Save Subject
            </button>
          </form>

          {/* Assign Subject */}

          <form
            onSubmit={(event) => void assign(event)}
            className="space-y-3 rounded-2xl border bg-white p-6"
          >
            <h2 className="text-lg font-bold">
              Assign to Class
            </h2>

            <select
              required
              aria-label="Select class"
              className={input}
              value={classId}
              onChange={(event) =>
                setClassId(event.target.value)
              }
            >
              <option value="">Select class</option>

              {classes.map((schoolClass) => (
                <option
                  key={schoolClass.id}
                  value={schoolClass.id}
                >
                  {schoolClass.name}
                </option>
              ))}
            </select>

            <select
              required
              aria-label="Select subject"
              className={input}
              value={subjectId}
              onChange={(event) =>
                setSubjectId(event.target.value)
              }
            >
              <option value="">Select subject</option>

              {subjects
                .filter((subject) => subject.is_active)
                .map((subject) => (
                  <option
                    key={subject.id}
                    value={subject.id}
                  >
                    {subject.name}
                  </option>
                ))}
            </select>

            <button
              disabled={
                saving ||
                !classId ||
                !subjectId
              }
              className="rounded-lg bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-40"
            >
              Assign Subject
            </button>
          </form>
        </div>
      )}

      {/* Subject Catalog */}

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-bold">
          Subject Catalog ({subjects.length})
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {subjects.map((subject) => (
            <div
              key={subject.id}
              className="rounded-xl border p-4"
            >
              <div className="font-semibold">
                {subject.name}{" "}

                <span className="text-sm text-slate-500">
                  ({subject.code})
                </span>
              </div>

              <p className="text-sm text-slate-500">
                {subject.is_core ? "Core" : "Elective"}
                {" · "}
                {subject.is_active
                  ? "Active"
                  : "Inactive"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Class Assignments */}

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-bold">
          Class Assignments
        </h2>

        <ul className="mt-4 space-y-2">
          {assignments.map((assignment) => (
            <li
              key={assignment.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <span>
                {classes.find(
                  (schoolClass) =>
                    schoolClass.id === assignment.class_id
                )?.name ?? "Class"}
                {" — "}
                {subjects.find(
                  (subject) =>
                    subject.id === assignment.subject_id
                )?.name ?? "Subject"}
              </span>

              {canManage && (
                <button
                  type="button"
                  onClick={() =>
                    void remove(assignment.id)
                  }
                  className="font-semibold text-red-700"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}