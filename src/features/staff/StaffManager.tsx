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

type Staff = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  job_title: string;
  email: string | null;
  phone: string | null;
  status: string;
  branch_id: string;
};

const field =
  "w-full rounded-xl border border-slate-300 px-4 py-3";

interface Props {
  schoolId: string;
  canManage: boolean;
}

export default function StaffManager({
  schoolId,
  canManage,
}: Props) {
  const db = useMemo(() => createClient(), []);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);

  const [branchId, setBranchId] = useState("");
  const [employee, setEmployee] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [title, setTitle] = useState("Teacher");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [branchesResponse, staffResponse] =
      await Promise.all([
        db
          .from("branches")
          .select("id,name")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .order("name"),

        db
          .from("staff_members")
          .select(
            "id,employee_number,first_name,last_name,job_title,email,phone,status,branch_id"
          )
          .eq("school_id", schoolId)
          .order("last_name")
          .limit(500),
      ]);

    if (branchesResponse.error || staffResponse.error) {
      setError("Unable to retrieve staff or branches.");
      return;
    }

    const loadedBranches =
      (branchesResponse.data ?? []) as Branch[];

    setBranches(loadedBranches);

    setStaff(
      (staffResponse.data ?? []) as Staff[]
    );

    setBranchId(
      (previous) =>
        previous || (loadedBranches[0]?.id ?? "")
    );
  }, [db, schoolId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();

    if (!canManage || saving || !branchId) return;

    setSaving(true);
    setError("");
    setNotice("");

    const { error: insertError } = await db
      .from("staff_members")
      .insert({
        school_id: schoolId,
        branch_id: branchId,
        employee_number: employee.trim(),
        first_name: first.trim(),
        last_name: last.trim(),
        job_title: title.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Staff member registered.");

    setEmployee("");
    setFirst("");
    setLast("");
    setEmail("");
    setPhone("");

    await load();
  }

  async function changeStatus(
    id: string,
    status: string
  ) {
    if (!canManage) return;

    setError("");

    const { error: updateError } = await db
      .from("staff_members")
      .update({ status })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotice("Staff status updated.");

    await load();
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

      {canManage && (
        <form
          onSubmit={(event) => void add(event)}
          className="space-y-4 rounded-2xl border bg-white p-6"
        >
          <h2 className="text-xl font-bold">
            Register Staff / Teacher
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              Branch

              <select
                required
                className={field}
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

            <label className="block text-sm">
              Employee Number

              <input
                required
                minLength={2}
                maxLength={40}
                className={field}
                value={employee}
                onChange={(event) =>
                  setEmployee(event.target.value)
                }
              />
            </label>

            <label className="block text-sm">
              First Name

              <input
                required
                maxLength={100}
                className={field}
                value={first}
                onChange={(event) =>
                  setFirst(event.target.value)
                }
              />
            </label>

            <label className="block text-sm">
              Last Name

              <input
                required
                maxLength={100}
                className={field}
                value={last}
                onChange={(event) =>
                  setLast(event.target.value)
                }
              />
            </label>

            <label className="block text-sm">
              Job Title

              <input
                required
                minLength={2}
                maxLength={120}
                className={field}
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
              />
            </label>

            <label className="block text-sm">
              Phone

              <input
                className={field}
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value)
                }
              />
            </label>

            <label className="block text-sm">
              Email

              <input
                type="email"
                className={field}
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
              />
            </label>
          </div>

          <button
            disabled={saving || !branchId}
            className="rounded-xl bg-blue-800 px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saving..." : "Register Staff"}
          </button>
        </form>
      )}

      <section className="overflow-x-auto rounded-2xl border bg-white">
        <h2 className="p-6 text-xl font-bold">
          Staff Directory
        </h2>

        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Employee #</th>
              <th className="p-4">Name</th>
              <th className="p-4">Position</th>
              <th className="p-4">Branch</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>

          <tbody>
            {staff.map((member) => (
              <tr
                key={member.id}
                className="border-t"
              >
                <td className="p-4">
                  {member.employee_number}
                </td>

                <td className="p-4 font-semibold">
                  {member.first_name} {member.last_name}
                </td>

                <td className="p-4">
                  {member.job_title}
                </td>

                <td className="p-4">
                  {branches.find(
                    (branch) =>
                      branch.id === member.branch_id
                  )?.name ?? "Branch"}
                </td>

                <td className="p-4">
                  {canManage ? (
                    <select
                      aria-label={`Status for ${member.first_name} ${member.last_name}`}
                      className="rounded border p-2"
                      value={member.status}
                      onChange={(event) =>
                        void changeStatus(
                          member.id,
                          event.target.value
                        )
                      }
                    >
                      {[
                        "active",
                        "on_leave",
                        "inactive",
                      ].map((status) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {status}
                        </option>
                      ))}
                    </select>
                  ) : (
                    member.status
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {staff.length === 0 && (
          <p className="p-6 text-slate-500">
            No staff registered.
          </p>
        )}
      </section>
    </div>
  );
}