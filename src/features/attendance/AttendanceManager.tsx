"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

type SchoolClass = {
  id: string;
  name: string;
};

type AcademicYear = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: string;
};

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
};

type Enrollment = {
  id: string;
  student_id: string;
  class_id: string;
  academic_year_id: string;
};

type Attendance = {
  id: string;
  enrollment_id: string;
  school_day: string;
  status: string;
  remarks: string | null;
};

type MarkStatus =
  | "present"
  | "absent"
  | "late"
  | "excused";

const statuses: MarkStatus[] = [
  "present",
  "absent",
  "late",
  "excused",
];

const field =
  "rounded-xl border border-slate-300 bg-white px-3 py-2.5";

function localDate() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

interface Props {
  schoolId: string;
  canManage: boolean;
}

export default function AttendanceManager({
  schoolId,
  canManage,
}: Props) {
  const db = useMemo(() => createClient(), []);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const [enrollments, setEnrollments] =
    useState<Enrollment[]>([]);

  const [attendance, setAttendance] =
    useState<Attendance[]>([]);

  const [classId, setClassId] = useState("");
  const [yearId, setYearId] = useState("");
  const [day, setDay] = useState(localDate);

  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // Load selectors
  const init = useCallback(async () => {
    const [classesResponse, yearsResponse, studentsResponse] =
      await Promise.all([
        db
          .from("school_classes")
          .select("id,name")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .order("name"),

        db
          .from("academic_years")
          .select("id,name,starts_on,ends_on,status")
          .eq("school_id", schoolId)
          .order("starts_on", { ascending: false }),

        db
          .from("students")
          .select("id,first_name,last_name,admission_number")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .order("last_name")
          .limit(1000),
      ]);

    if (
      classesResponse.error ||
      yearsResponse.error ||
      studentsResponse.error
    ) {
      setError("Unable to load attendance selectors.");
      return;
    }

    const loadedClasses =
      (classesResponse.data ?? []) as SchoolClass[];

    const loadedYears =
      (yearsResponse.data ?? []) as AcademicYear[];

    setClasses(loadedClasses);
    setYears(loadedYears);

    setStudents(
      (studentsResponse.data ?? []) as Student[]
    );

    setClassId(
      (previous) =>
        previous || (loadedClasses[0]?.id ?? "")
    );

    setYearId(
      (previous) =>
        previous ||
        loadedYears.find((year) => year.status === "active")
          ?.id ||
        loadedYears[0]?.id ||
        ""
    );
  }, [db, schoolId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void init();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [init]);

  // Load attendance
  const load = useCallback(async () => {
    if (!classId || !yearId) {
      setEnrollments([]);
      setAttendance([]);
      return;
    }

    setLoading(true);
    setError("");

    const enrollmentResponse = await db
      .from("student_enrollments")
      .select("id,student_id,class_id,academic_year_id")
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .eq("academic_year_id", yearId)
      .eq("status", "active")
      .order("created_at")
      .limit(1000);

    if (enrollmentResponse.error) {
      setError("Unable to load enrolled students.");
      setLoading(false);
      return;
    }

    const loadedEnrollments =
      (enrollmentResponse.data ?? []) as Enrollment[];

    setEnrollments(loadedEnrollments);

    if (loadedEnrollments.length === 0) {
      setAttendance([]);
      setLoading(false);
      return;
    }

    const attendanceResponse = await db
      .from("student_attendance")
      .select("id,enrollment_id,school_day,status,remarks")
      .eq("school_id", schoolId)
      .eq("school_day", day)
      .in(
        "enrollment_id",
        loadedEnrollments.map((item) => item.id)
      );

    if (attendanceResponse.error) {
      setError("Unable to load attendance records.");
    } else {
      setAttendance(
        (attendanceResponse.data ?? []) as Attendance[]
      );
    }

    setLoading(false);
  }, [db, schoolId, classId, yearId, day]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const year = years.find(
    (item) => item.id === yearId
  );

  const validDay = Boolean(
    year &&
      day >= year.starts_on &&
      day <= year.ends_on
  );

  async function mark(
    enrollmentId: string,
    status: MarkStatus
  ) {
    if (!canManage || working || !validDay) return;

    setWorking(enrollmentId);
    setError("");
    setNotice("");

    const current = attendance.find(
      (item) => item.enrollment_id === enrollmentId
    );

    const result = current
      ? await db
          .from("student_attendance")
          .update({ status })
          .eq("id", current.id)
          .eq("school_id", schoolId)
      : await db
          .from("student_attendance")
          .insert({
            school_id: schoolId,
            enrollment_id: enrollmentId,
            school_day: day,
            status,
          });

    setWorking(null);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setNotice("Attendance saved.");

    await load();
  }

  const totals = Object.fromEntries(
    statuses.map((status) => [
      status,
      attendance.filter(
        (item) => item.status === status
      ).length,
    ])
  ) as Record<MarkStatus, number>;

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

      <div className="flex flex-wrap gap-4 rounded-2xl border bg-white p-6">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Class

          <select
            className={field}
            value={classId}
            onChange={(event) =>
              setClassId(event.target.value)
            }
          >
            <option value="">Select class</option>

            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Academic Year

          <select
            className={field}
            value={yearId}
            onChange={(event) =>
              setYearId(event.target.value)
            }
          >
            <option value="">Select year</option>

            {years.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-semibold">
          Date

          <input
            type="date"
            className={field}
            value={day}
            onChange={(event) =>
              setDay(event.target.value)
            }
          />
        </label>

        <button
          type="button"
          onClick={() => void load()}
          className="self-end rounded-lg border px-4 py-3"
        >
          Refresh
        </button>
      </div>

      {!validDay && (
        <p className="rounded-lg bg-amber-50 p-4 text-amber-900">
          Select a date within the academic year.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statuses.map((status) => (
          <div
            key={status}
            className="rounded-xl border bg-white p-4"
          >
            <div className="text-2xl font-bold">
              {totals[status]}
            </div>

            <div className="text-sm capitalize text-slate-500">
              {status}
            </div>
          </div>
        ))}
      </div>

      <section className="overflow-x-auto rounded-2xl border bg-white">
        <h2 className="p-6 text-xl font-bold">
          Daily Attendance ({enrollments.length} enrolled)
        </h2>

        {loading ? (
          <p className="p-6">Loading...</p>
        ) : (
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-4">Student</th>
                <th className="p-4">Admission</th>
                <th className="p-4">Recorded</th>
                <th className="p-4">Mark</th>
              </tr>
            </thead>

            <tbody>
              {enrollments.map((enrollment) => {
                const student = students.find(
                  (item) =>
                    item.id === enrollment.student_id
                );

                const existing = attendance.find(
                  (item) =>
                    item.enrollment_id === enrollment.id
                );

                return (
                  <tr
                    key={enrollment.id}
                    className="border-t"
                  >
                    <td className="p-4 font-semibold">
                      {student
                        ? `${student.first_name} ${student.last_name}`
                        : "Student"}
                    </td>

                    <td className="p-4">
                      {student?.admission_number ?? "—"}
                    </td>

                    <td className="p-4 capitalize">
                      {existing?.status ?? "Not marked"}
                    </td>

                    <td className="p-4">
                      <select
                        aria-label={`Mark attendance for ${
                          student?.first_name ?? "student"
                        }`}
                        className={field}
                        disabled={
                          !canManage ||
                          Boolean(working) ||
                          !validDay
                        }
                        value={existing?.status ?? ""}
                        onChange={(event) =>
                          void mark(
                            enrollment.id,
                            event.target.value as MarkStatus
                          )
                        }
                      >
                        <option value="">
                          Choose status
                        </option>

                        {statuses.map((status) => (
                          <option
                            key={status}
                            value={status}
                          >
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && enrollments.length === 0 && (
          <p className="p-6 text-slate-500">
            No active enrollments for this class and year.
          </p>
        )}
      </section>
    </div>
  );
}