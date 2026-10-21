"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";

type Branch = {
  id: string;
  name: string;
};

type SchoolClass = {
  id: string;
  branch_id: string;
  name: string;
  code: string;
  level_order: number;
  is_active: boolean;
};

type Stream = {
  id: string;
  class_id: string;
  name: string;
  code: string;
  capacity: number | null;
  is_active: boolean;
};

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900";

interface Props {
  schoolId: string;
  canManage: boolean;
}

export default function ClassStreamManager({
  schoolId,
  canManage,
}: Props) {
  const db = useMemo(() => createClient(), []);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);

  const [branchId, setBranchId] = useState("");

  const [className, setClassName] = useState("");
  const [classCode, setClassCode] = useState("");
  const [level, setLevel] = useState("1");

  const [classId, setClassId] = useState("");
  const [streamName, setStreamName] = useState("");
  const [streamCode, setStreamCode] = useState("");
  const [capacity, setCapacity] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [branchesResponse, classesResponse, streamsResponse] =
      await Promise.all([
        db
          .from("branches")
          .select("id,name")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .order("name"),

        db
          .from("school_classes")
          .select(
            "id,branch_id,name,code,level_order,is_active"
          )
          .eq("school_id", schoolId)
          .order("level_order"),

        db
          .from("class_streams")
          .select(
            "id,class_id,name,code,capacity,is_active"
          )
          .eq("school_id", schoolId)
          .order("name"),
      ]);

    if (
      branchesResponse.error ||
      classesResponse.error ||
      streamsResponse.error
    ) {
      setError(
        "Unable to load classes, streams or branches. Check permissions."
      );
      return;
    }

    const loadedBranches =
      (branchesResponse.data ?? []) as Branch[];

    const loadedClasses =
      (classesResponse.data ?? []) as SchoolClass[];

    setBranches(loadedBranches);
    setClasses(loadedClasses);

    setStreams(
      (streamsResponse.data ?? []) as Stream[]
    );

    setBranchId(
      (previous) =>
        previous || (loadedBranches[0]?.id ?? "")
    );

    setClassId(
      (previous) =>
        previous || (loadedClasses[0]?.id ?? "")
    );
  }, [db, schoolId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  async function addClass(event: FormEvent) {
    event.preventDefault();

    if (!canManage || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { error: insertError } = await db
      .from("school_classes")
      .insert({
        school_id: schoolId,
        branch_id: branchId,
        name: className.trim(),
        code: classCode.trim().toUpperCase(),
        level_order: Number(level),
      });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Class created.");
    setClassName("");
    setClassCode("");

    await load();
  }

  async function addStream(event: FormEvent) {
    event.preventDefault();

    if (!canManage || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    const { error: insertError } = await db
      .from("class_streams")
      .insert({
        school_id: schoolId,
        class_id: classId,
        name: streamName.trim(),
        code: streamCode.trim().toUpperCase(),
        capacity: capacity ? Number(capacity) : null,
      });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Stream created.");

    setStreamName("");
    setStreamCode("");
    setCapacity("");

    await load();
  }

  return (
    <div className="space-y-7">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-red-700"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-xl bg-green-50 p-3 text-green-700"
        >
          {notice}
        </p>
      )}

      {canManage && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={(event) => void addClass(event)}
            className="space-y-3 rounded-2xl border bg-white p-6"
          >
            <h2 className="text-lg font-bold">
              Create Class
            </h2>

            <label className="block text-sm">
              Branch

              <select
                required
                className={input}
                value={branchId}
                onChange={(event) =>
                  setBranchId(event.target.value)
                }
              >
                <option value="">Select branch</option>

                {branches.map((branch) => (
                  <option
                    key={branch.id}
                    value={branch.id}
                  >
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <input
              required
              minLength={2}
              maxLength={100}
              className={input}
              placeholder="Class name (e.g. Primary 1)"
              value={className}
              onChange={(event) =>
                setClassName(event.target.value)
              }
            />

            <input
              required
              pattern="[A-Za-z0-9_-]{2,30}"
              className={input}
              placeholder="Code (e.g. P1)"
              value={classCode}
              onChange={(event) =>
                setClassCode(event.target.value)
              }
            />

            <label className="block text-sm">
              Level Order

              <input
                type="number"
                min={1}
                max={99}
                required
                className={input}
                value={level}
                onChange={(event) =>
                  setLevel(event.target.value)
                }
              />
            </label>

            <button
              disabled={busy || !branchId}
              className="rounded-lg bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-40"
            >
              Create Class
            </button>
          </form>

          <form
            onSubmit={(event) => void addStream(event)}
            className="space-y-3 rounded-2xl border bg-white p-6"
          >
            <h2 className="text-lg font-bold">
              Create Stream
            </h2>

            <select
              aria-label="Class for stream"
              required
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
                  {schoolClass.name} ({schoolClass.code})
                </option>
              ))}
            </select>

            <input
              required
              minLength={1}
              maxLength={80}
              className={input}
              placeholder="Stream name (e.g. A)"
              value={streamName}
              onChange={(event) =>
                setStreamName(event.target.value)
              }
            />

            <input
              required
              pattern="[A-Za-z0-9_-]{1,30}"
              className={input}
              placeholder="Stream code (e.g. A)"
              value={streamCode}
              onChange={(event) =>
                setStreamCode(event.target.value)
              }
            />

            <input
              type="number"
              min={1}
              max={1000}
              className={input}
              placeholder="Capacity (optional)"
              value={capacity}
              onChange={(event) =>
                setCapacity(event.target.value)
              }
            />

            <button
              disabled={busy || !classId}
              className="rounded-lg bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-40"
            >
              Create Stream
            </button>
          </form>
        </div>
      )}

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-bold">
          Classes and Streams
        </h2>

        {classes.length === 0 ? (
          <p className="mt-4 text-slate-500">
            No classes created.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {classes.map((schoolClass) => (
              <article
                key={schoolClass.id}
                className="rounded-xl border p-4"
              >
                <h3 className="font-semibold">
                  {schoolClass.name}{" "}
                  <span className="text-sm text-slate-500">
                    ({schoolClass.code})
                  </span>
                </h3>

                <p className="text-xs text-slate-500">
                  {branches.find(
                    (branch) =>
                      branch.id === schoolClass.branch_id
                  )?.name ?? "Branch"}
                  {" · "}
                  Level {schoolClass.level_order}
                  {" · "}
                  {schoolClass.is_active
                    ? "Active"
                    : "Inactive"}
                </p>

                <p className="mt-3 text-sm">
                  Streams:{" "}
                  {streams
                    .filter(
                      (stream) =>
                        stream.class_id === schoolClass.id
                    )
                    .map((stream) => stream.name)
                    .join(", ") || "None"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}