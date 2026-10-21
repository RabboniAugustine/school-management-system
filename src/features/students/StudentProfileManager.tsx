"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";

type Student = {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  status: string;
};

type Guardian = {
  id: string;
  full_name: string;
  relationship: string;
  phone: string;
  email: string | null;
  is_primary: boolean;
};

const field =
  "w-full rounded-xl border border-slate-300 px-4 py-3";

interface Props {
  schoolId: string;
  studentId: string;
  canManage: boolean;
}

export default function StudentProfileManager({
  schoolId,
  studentId,
  canManage,
}: Props) {
  const db = useMemo(() => createClient(), []);

  const [student, setStudent] = useState<Student | null>(null);

  const [guardians, setGuardians] = useState<Guardian[]>([]);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [guardianName, setGuardianName] = useState("");
  const [guardianRelation, setGuardianRelation] =
    useState("guardian");

  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");

  const [primary, setPrimary] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const [studentResponse, guardiansResponse] =
      await Promise.all([
        db
          .from("students")
          .select(
            "id,admission_number,first_name,last_name,middle_name,date_of_birth,gender,status"
          )
          .eq("school_id", schoolId)
          .eq("id", studentId)
          .maybeSingle(),

        db
          .from("student_guardians")
          .select(
            "id,full_name,relationship,phone,email,is_primary"
          )
          .eq("school_id", schoolId)
          .eq("student_id", studentId)
          .order("is_primary", {
            ascending: false,
          }),
      ]);

    if (
      studentResponse.error ||
      guardiansResponse.error
    ) {
      setError("Unable to load student profile.");
    } else {
      setStudent(
        studentResponse.data as Student | null
      );

      setGuardians(
        (guardiansResponse.data ?? []) as Guardian[]
      );
    }

    setLoading(false);
  }, [db, schoolId, studentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveStudent(event: FormEvent) {
    event.preventDefault();

    if (!canManage || !student || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { error: updateError } = await db
      .from("students")
      .update({
        admission_number: student.admission_number.trim(),
        first_name: student.first_name.trim(),
        last_name: student.last_name.trim(),
        middle_name: student.middle_name?.trim() || null,
        date_of_birth: student.date_of_birth || null,
        gender: student.gender || null,
        status: student.status,
      })
      .eq("school_id", schoolId)
      .eq("id", studentId);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotice("Student profile updated.");

    await load();
  }

  async function addGuardian(event: FormEvent) {
    event.preventDefault();

    if (!canManage || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { error: insertError } = await db
      .from("student_guardians")
      .insert({
        school_id: schoolId,
        student_id: studentId,
        full_name: guardianName.trim(),
        relationship: guardianRelation,
        phone: guardianPhone.trim(),
        email: guardianEmail.trim() || null,
        is_primary: primary,
      });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Guardian contact saved.");

    setGuardianName("");
    setGuardianPhone("");
    setGuardianEmail("");
    setPrimary(false);

    await load();
  }

  async function removeGuardian(id: string) {
    if (!canManage) return;

    const confirmed = window.confirm(
      "Remove this guardian contact?"
    );

    if (!confirmed) return;

    const { error: deleteError } = await db
      .from("student_guardians")
      .delete()
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("student_id", studentId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setNotice("Guardian removed.");

    await load();
  }

  if (loading) {
    return (
      <p className="rounded-xl bg-white p-6">
        Loading student profile...
      </p>
    );
  }

  if (!student) {
    return (
      <p className="rounded-xl bg-red-50 p-6 text-red-700">
        Student not found or inaccessible.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-red-700"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-xl bg-green-50 p-4 text-green-700"
        >
          {notice}
        </p>
      )}

      {/* Student Profile */}

      <form
        onSubmit={(event) => void saveStudent(event)}
        className="space-y-4 rounded-2xl border bg-white p-6"
      >
        <h2 className="text-xl font-bold">
          Student Profile
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold">
            Admission Number

            <input
              required
              minLength={2}
              maxLength={40}
              disabled={!canManage}
              className={field}
              value={student.admission_number}
              onChange={(event) =>
                setStudent({
                  ...student,
                  admission_number: event.target.value,
                })
              }
            />
          </label>

          <label className="block text-sm font-semibold">
            First Name

            <input
              required
              maxLength={100}
              disabled={!canManage}
              className={field}
              value={student.first_name}
              onChange={(event) =>
                setStudent({
                  ...student,
                  first_name: event.target.value,
                })
              }
            />
          </label>

          <label className="block text-sm font-semibold">
            Last Name

            <input
              required
              maxLength={100}
              disabled={!canManage}
              className={field}
              value={student.last_name}
              onChange={(event) =>
                setStudent({
                  ...student,
                  last_name: event.target.value,
                })
              }
            />
          </label>

          <label className="block text-sm font-semibold">
            Middle Name

            <input
              maxLength={100}
              disabled={!canManage}
              className={field}
              value={student.middle_name ?? ""}
              onChange={(event) =>
                setStudent({
                  ...student,
                  middle_name: event.target.value,
                })
              }
            />
          </label>

          <label className="block text-sm font-semibold">
            Date of Birth

            <input
              type="date"
              disabled={!canManage}
              className={field}
              value={student.date_of_birth ?? ""}
              onChange={(event) =>
                setStudent({
                  ...student,
                  date_of_birth: event.target.value || null,
                })
              }
            />
          </label>

          <label className="block text-sm font-semibold">
            Gender

            <select
              disabled={!canManage}
              className={field}
              value={student.gender ?? ""}
              onChange={(event) =>
                setStudent({
                  ...student,
                  gender: event.target.value || null,
                })
              }
            >
              <option value="">Not specified</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">
                Prefer not to say
              </option>
            </select>
          </label>

          <label className="block text-sm font-semibold">
            Status

            <select
              disabled={!canManage}
              className={field}
              value={student.status}
              onChange={(event) =>
                setStudent({
                  ...student,
                  status: event.target.value,
                })
              }
            >
              {[
                "active",
                "graduated",
                "transferred",
                "withdrawn",
              ].map((status) => (
                <option
                  key={status}
                  value={status}
                >
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        {canManage && (
          <button
            disabled={busy}
            className="rounded-xl bg-blue-800 px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            Save Student Changes
          </button>
        )}
      </form>

      {/* Guardian Contacts */}

      <section className="space-y-4 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">
          Guardian Contacts
        </h2>

        {guardians.length === 0 && (
          <p className="text-slate-500">
            No guardian contacts yet.
          </p>
        )}

        {guardians.map((guardian) => (
          <div
            key={guardian.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
          >
            <div>
              <p className="font-semibold">
                {guardian.full_name}{" "}

                {guardian.is_primary && (
                  <span className="text-xs text-green-700">
                    (Primary)
                  </span>
                )}
              </p>

              <p className="text-sm capitalize text-slate-500">
                {guardian.relationship} · {guardian.phone}

                {guardian.email
                  ? ` · ${guardian.email}`
                  : ""}
              </p>
            </div>

            {canManage && (
              <button
                type="button"
                onClick={() =>
                  void removeGuardian(guardian.id)
                }
                className="font-semibold text-red-700"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </section>

      {/* Add Guardian */}

      {canManage && (
        <form
          onSubmit={(event) => void addGuardian(event)}
          className="space-y-4 rounded-2xl border bg-white p-6"
        >
          <h2 className="text-xl font-bold">
            Add Guardian
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              Full Name

              <input
                required
                minLength={2}
                maxLength={160}
                className={field}
                value={guardianName}
                onChange={(event) =>
                  setGuardianName(event.target.value)
                }
              />
            </label>

            <label className="block text-sm">
              Relationship

              <select
                className={field}
                value={guardianRelation}
                onChange={(event) =>
                  setGuardianRelation(event.target.value)
                }
              >
                {[
                  "guardian",
                  "mother",
                  "father",
                  "other",
                ].map((relationship) => (
                  <option
                    key={relationship}
                    value={relationship}
                  >
                    {relationship}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              Phone

              <input
                required
                minLength={7}
                maxLength={25}
                className={field}
                value={guardianPhone}
                onChange={(event) =>
                  setGuardianPhone(event.target.value)
                }
              />
            </label>

            <label className="block text-sm">
              Email (optional)

              <input
                type="email"
                maxLength={254}
                className={field}
                value={guardianEmail}
                onChange={(event) =>
                  setGuardianEmail(event.target.value)
                }
              />
            </label>
          </div>

          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={primary}
              onChange={(event) =>
                setPrimary(event.target.checked)
              }
            />

            Primary guardian (one per student)
          </label>

          <button
            disabled={busy}
            className="rounded-xl bg-blue-800 px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            Save Guardian
          </button>
        </form>
      )}
    </div>
  );
}