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
  first_name: string;
  last_name: string;
  admission_number: string;
  branch_id: string;
};

type Year = {
  id: string;
  name: string;
  status: string;
};

type SchoolClass = {
  id: string;
  name: string;
  branch_id: string;
};

type Stream = {
  id: string;
  name: string;
  class_id: string;
};

type Enrollment = {
  id: string;
  student_id: string;
  academic_year_id: string;
  class_id: string;
  stream_id: string | null;
  status: string;
};

const input =
  "w-full rounded-xl border border-slate-300 px-4 py-3";

interface Props {
  schoolId: string;
  canManage: boolean;
}

export default function EnrollmentManager({
  schoolId,
  canManage,
}: Props) {
  const db = useMemo(() => createClient(), []);

  const [students, setStudents] = useState<Student[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);

  const [enrollments, setEnrollments] =
    useState<Enrollment[]>([]);

  const [studentId, setStudentId] = useState("");
  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [
      studentsResponse,
      yearsResponse,
      classesResponse,
      streamsResponse,
      enrollmentsResponse,
    ] = await Promise.all([
      db
        .from("students")
        .select(
          "id,first_name,last_name,admission_number,branch_id"
        )
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("last_name")
        .limit(1000),

      db
        .from("academic_years")
        .select("id,name,status")
        .eq("school_id", schoolId)
        .in("status", ["planned", "active"])
        .order("starts_on", { ascending: false }),

      db
        .from("school_classes")
        .select("id,name,branch_id")
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .order("name"),

      db
        .from("class_streams")
        .select("id,name,class_id")
        .eq("school_id", schoolId)
        .eq("is_active", true),

      db
        .from("student_enrollments")
        .select(
          "id,student_id,academic_year_id,class_id,stream_id,status"
        )
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (
      studentsResponse.error ||
      yearsResponse.error ||
      classesResponse.error ||
      streamsResponse.error ||
      enrollmentsResponse.error
    ) {
      setError(
        "Unable to load enrollment data. Verify module permissions."
      );
      return;
    }

    const loadedStudents =
      (studentsResponse.data ?? []) as Student[];

    const loadedYears =
      (yearsResponse.data ?? []) as Year[];

    setStudents(loadedStudents);
    setYears(loadedYears);

    setClasses(
      (classesResponse.data ?? []) as SchoolClass[]
    );

    setStreams(
      (streamsResponse.data ?? []) as Stream[]
    );

    setEnrollments(
      (enrollmentsResponse.data ?? []) as Enrollment[]
    );

    setStudentId(
      (previous) =>
        previous || (loadedStudents[0]?.id ?? "")
    );

    setYearId(
      (previous) =>
        previous || (loadedYears[0]?.id ?? "")
    );
  }, [db, schoolId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedStudent = students.find(
    (student) => student.id === studentId
  );

  const eligibleClasses = useMemo(
    () =>
      classes.filter(
        (schoolClass) =>
          schoolClass.branch_id === selectedStudent?.branch_id
      ),
    [classes, selectedStudent?.branch_id]
  );

  // Derive eligible selections without updating state in an effect.
  const selectedClassId = eligibleClasses.some(
    (schoolClass) => schoolClass.id === classId
  )
    ? classId
    : (eligibleClasses[0]?.id ?? "");

  const eligibleStreams = streams.filter(
    (stream) => stream.class_id === selectedClassId
  );

  const selectedStreamId = eligibleStreams.some(
    (stream) => stream.id === streamId
  )
    ? streamId
    : "";

  async function enroll(event: FormEvent) {
    event.preventDefault();

    if (
      !canManage ||
      busy ||
      !studentId ||
      !yearId ||
      !selectedClassId
    ) {
      return;
    }

    setError("");
    setNotice("");
    setBusy(true);

    const { error: insertError } = await db
      .from("student_enrollments")
      .insert({
        school_id: schoolId,
        student_id: studentId,
        academic_year_id: yearId,
        class_id: selectedClassId,
        stream_id: selectedStreamId || null,
      });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Student enrolled successfully.");

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
        <form
          onSubmit={(event) => void enroll(event)}
          className="space-y-4 rounded-2xl border bg-white p-6"
        >
          <h2 className="text-xl font-bold">
            Enrol Student in Class
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              Student

              <select
                className={input}
                required
                value={studentId}
                onChange={(event) => {
                  setStudentId(event.target.value);
                  setClassId("");
                  setStreamId("");
                }}
              >
                <option value="">Select student</option>

                {students.map((student) => (
                  <option
                    key={student.id}
                    value={student.id}
                  >
                    {student.last_name}, {student.first_name}
                    {" "}
                    ({student.admission_number})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              Academic Year

              <select
                className={input}
                required
                value={yearId}
                onChange={(event) =>
                  setYearId(event.target.value)
                }
              >
                <option value="">Select year</option>

                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name} ({year.status})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              Class

              <select
                className={input}
                required
                value={selectedClassId}
                onChange={(event) => {
                  setClassId(event.target.value);
                  setStreamId("");
                }}
              >
                <option value="">Select class</option>

                {eligibleClasses.map((schoolClass) => (
                  <option
                    key={schoolClass.id}
                    value={schoolClass.id}
                  >
                    {schoolClass.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              Stream (optional)

              <select
                className={input}
                value={selectedStreamId}
                onChange={(event) =>
                  setStreamId(event.target.value)
                }
              >
                <option value="">No stream</option>

                {eligibleStreams.map((stream) => (
                  <option
                    key={stream.id}
                    value={stream.id}
                  >
                    {stream.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-sm text-slate-500">
            One class enrollment per student per academic year.
            Class must match the student branch.
          </p>

          <button
            disabled={
              busy ||
              !studentId ||
              !yearId ||
              !selectedClassId
            }
            className="rounded-xl bg-blue-800 px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Saving..." : "Enroll Student"}
          </button>
        </form>
      )}

      <section className="overflow-x-auto rounded-2xl border bg-white">
        <h2 className="p-6 text-xl font-bold">
          Recent Enrollments
        </h2>

        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Student</th>
              <th className="p-4">Year</th>
              <th className="p-4">Class</th>
              <th className="p-4">Stream</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>

          <tbody>
            {enrollments.map((enrollment) => (
              <tr
                key={enrollment.id}
                className="border-t"
              >
                <td className="p-4">
                  {students.find(
                    (student) =>
                      student.id === enrollment.student_id
                  )?.admission_number ?? "Student"}
                </td>

                <td className="p-4">
                  {years.find(
                    (year) =>
                      year.id === enrollment.academic_year_id
                  )?.name ?? "Academic year"}
                </td>

                <td className="p-4">
                  {classes.find(
                    (schoolClass) =>
                      schoolClass.id === enrollment.class_id
                  )?.name ?? "Class"}
                </td>

                <td className="p-4">
                  {streams.find(
                    (stream) =>
                      stream.id === enrollment.stream_id
                  )?.name ?? "—"}
                </td>

                <td className="p-4 capitalize">
                  {enrollment.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {enrollments.length === 0 && (
          <p className="p-6 text-slate-500">
            No enrollments yet.
          </p>
        )}
      </section>
    </div>
  );
}