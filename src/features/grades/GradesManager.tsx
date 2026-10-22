"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dbMessage, esc, fmtDate, printHtml } from "@/lib/format";
import { btn, btnLight, card, field, label, td, th } from "@/components/ui/styles";
import Tabs from "@/components/ui/Tabs";
import Notice from "@/components/ui/Notice";
import Empty from "@/components/ui/Empty";

type Year = { id: string; name: string; status: string };
type Term = { id: string; name: string; academic_year_id: string; starts_on: string; ends_on: string; status: string };
type Cls = { id: string; name: string };
type Subject = { id: string; name: string };
type Band = { id: string; grade: string; min_score: number; max_score: number; remark: string };
type Assessment = { id: string; subject_id: string; name: string; kind: string; max_score: number; weight_percent: number; assessed_on: string | null; is_locked: boolean };
type Enrollment = { id: string; student_id: string };
type Student = { id: string; first_name: string; last_name: string; admission_number: string };
type Ranking = { enrollment_id: string; average_percent: number; position: number; class_size: number; subjects_counted: number };
type Result = { enrollment_id: string; subject_id: string; total_percent: number; grade: string | null; grade_remark: string | null };
type Remark = { enrollment_id: string; teacher_remark: string | null; head_remark: string | null };
type Tab = "reports" | "scores" | "assessments" | "scale";

const KINDS = [["class_test", "Class test"], ["assignment", "Assignment"], ["project", "Project"], ["mid_term", "Mid-term"], ["exam", "Exam"]] as const;
type DbResult<T> = { error: { message?: string; code?: string } | null; data?: T | null };

export default function GradesManager({ schoolId, schoolName, canManage }: { schoolId: string; schoolName: string; canManage: boolean }) {
  const db = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("reports");
  const [years, setYears] = useState<Year[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const [bandForm, setBandForm] = useState({ grade: "", min: "", max: "", remark: "" });
  const [af, setAf] = useState({ subject_id: "", name: "", kind: "class_test", max: "20", weight: "", on: "" });
  const [assessmentId, setAssessmentId] = useState("");
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [remarkForm, setRemarkForm] = useState({ teacher: "", head: "" });
  const [attendance, setAttendance] = useState<Record<string, number>>({});

  const term = terms.find((t) => t.id === termId);

  const loadBase = useCallback(async () => {
    const [y, t, c, b] = await Promise.all([
      db.from("academic_years").select("id,name,status").eq("school_id", schoolId).order("starts_on", { ascending: false }),
      db.from("terms").select("id,name,academic_year_id,starts_on,ends_on,status").eq("school_id", schoolId).order("starts_on", { ascending: false }),
      db.from("school_classes").select("id,name").eq("school_id", schoolId).eq("is_active", true).order("level_order"),
      db.from("grading_scales").select("id,grade,min_score,max_score,remark").eq("school_id", schoolId).order("min_score", { ascending: false }),
    ]);
    if (y.error || t.error || c.error || b.error) return setError("Unable to load grading data.");
    const termRows = (t.data ?? []) as Term[];
    setYears((y.data ?? []) as Year[]); setTerms(termRows); setClasses((c.data ?? []) as Cls[]); setBands((b.data ?? []) as Band[]);
    setTermId((cur) => cur || (termRows.find((r) => r.status === "active")?.id ?? termRows[0]?.id ?? ""));
    setClassId((cur) => cur || ((c.data ?? [])[0] as Cls | undefined)?.id || "");
  }, [db, schoolId]);
  useEffect(() => { void loadBase(); }, [loadBase]);

  const loadClass = useCallback(async () => {
    if (!termId || !classId || !term) return;
    const [cs, a, en, rk, rs, rm] = await Promise.all([
      db.from("class_subjects").select("subject_id, school_subjects(id,name)").eq("school_id", schoolId).eq("class_id", classId),
      db.from("assessments").select("id,subject_id,name,kind,max_score,weight_percent,assessed_on,is_locked").eq("school_id", schoolId).eq("term_id", termId).eq("class_id", classId).order("created_at"),
      db.from("student_enrollments").select("id,student_id").eq("school_id", schoolId).eq("class_id", classId).eq("academic_year_id", term.academic_year_id).eq("status", "active"),
      db.from("term_rankings").select("enrollment_id,average_percent,position,class_size,subjects_counted").eq("school_id", schoolId).eq("term_id", termId).eq("class_id", classId),
      db.from("subject_results").select("enrollment_id,subject_id,total_percent,grade,grade_remark").eq("school_id", schoolId).eq("term_id", termId).eq("class_id", classId),
      db.from("report_remarks").select("enrollment_id,teacher_remark,head_remark").eq("school_id", schoolId).eq("term_id", termId),
    ]);
    if (cs.error || a.error || en.error || rk.error || rs.error || rm.error) return setError("Unable to load class data.");
    const subs = ((cs.data ?? []) as unknown as { school_subjects: Subject | Subject[] | null }[])
      .map((r) => (Array.isArray(r.school_subjects) ? r.school_subjects[0] : r.school_subjects)).filter((s): s is Subject => !!s)
      .sort((x, y) => x.name.localeCompare(y.name));
    const enr = (en.data ?? []) as Enrollment[];
    setSubjects(subs); setAssessments((a.data ?? []) as Assessment[]); setEnrollments(enr);
    setRankings((rk.data ?? []) as Ranking[]); setResults((rs.data ?? []) as Result[]); setRemarks((rm.data ?? []) as Remark[]);
    setAf((f) => ({ ...f, subject_id: f.subject_id && subs.some((s) => s.id === f.subject_id) ? f.subject_id : subs[0]?.id ?? "" }));
    const ids = enr.map((e) => e.student_id);
    if (ids.length) {
      const st = await db.from("students").select("id,first_name,last_name,admission_number").eq("school_id", schoolId).in("id", ids);
      setStudents((st.data ?? []) as Student[]);
    } else setStudents([]);
  }, [db, schoolId, termId, classId, term]);
  useEffect(() => { void loadClass(); }, [loadClass]);

  // Load existing scores for the chosen assessment.
  useEffect(() => {
    setScoreInputs({});
    if (!assessmentId) return;
    void db.from("scores").select("enrollment_id,score").eq("school_id", schoolId).eq("assessment_id", assessmentId).then(({ data }) => {
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as { enrollment_id: string; score: number }[]) map[r.enrollment_id] = String(r.score);
      setScoreInputs(map);
    });
  }, [db, schoolId, assessmentId]);

  const studentOf = useCallback((enrollmentId: string) => {
    const sid = enrollments.find((e) => e.id === enrollmentId)?.student_id;
    return students.find((s) => s.id === sid);
  }, [enrollments, students]);
  const nameOf = (enrollmentId: string) => { const s = studentOf(enrollmentId); return s ? `${s.last_name}, ${s.first_name}` : "Unknown"; };
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Subject";
  const sortedEnrollments = [...enrollments].sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)));

  async function run<T>(fn: () => PromiseLike<DbResult<T>>, success: string, reload: "base" | "class" | "both" = "class") {
    setError(""); setOk(""); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) { setError(dbMessage(res.error)); return false; }
    setOk(success);
    if (reload !== "class") await loadBase();
    if (reload !== "base") await loadClass();
    return true;
  }

  async function addBand(e: React.FormEvent) {
    e.preventDefault();
    const min = Number(bandForm.min), max = Number(bandForm.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100 || min > max) return setError("Scores must be between 0 and 100, with the minimum not above the maximum.");
    if (await run(() => db.from("grading_scales").insert({ school_id: schoolId, grade: bandForm.grade.trim(), min_score: min, max_score: max, remark: bandForm.remark.trim() }), "Grade band added.", "base"))
      setBandForm({ grade: "", min: "", max: "", remark: "" });
  }

  async function addAssessment(e: React.FormEvent) {
    e.preventDefault();
    const max = Number(af.max), weight = Number(af.weight);
    if (!(max > 0) || !(weight > 0 && weight <= 100)) return setError("Enter a maximum score above 0 and a weight between 1 and 100.");
    if (await run(() => db.from("assessments").insert({
      school_id: schoolId, term_id: termId, class_id: classId, subject_id: af.subject_id, name: af.name.trim(), kind: af.kind, max_score: max, weight_percent: weight, assessed_on: af.on || null,
    }), "Assessment created.")) setAf((f) => ({ ...f, name: "", weight: "" }));
  }

  const assessment = assessments.find((a) => a.id === assessmentId);

  async function saveScores() {
    if (!assessment) return;
    const rows: { school_id: string; assessment_id: string; enrollment_id: string; score: number }[] = [];
    for (const e of enrollments) {
      const raw = (scoreInputs[e.id] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > assessment.max_score) return setError(`${nameOf(e.id)}: score must be between 0 and ${assessment.max_score}.`);
      rows.push({ school_id: schoolId, assessment_id: assessment.id, enrollment_id: e.id, score: n });
    }
    if (!rows.length) return setError("Enter at least one score.");
    await run(() => db.from("scores").upsert(rows, { onConflict: "school_id,assessment_id,enrollment_id" }), `${rows.length} score(s) saved.`);
  }

  async function openCard(enrollmentId: string) {
    setCardFor(enrollmentId);
    const rem = remarks.find((r) => r.enrollment_id === enrollmentId);
    setRemarkForm({ teacher: rem?.teacher_remark ?? "", head: rem?.head_remark ?? "" });
    setAttendance({});
    if (term) {
      const { data } = await db.from("student_attendance").select("status").eq("school_id", schoolId).eq("enrollment_id", enrollmentId).gte("school_day", term.starts_on).lte("school_day", term.ends_on);
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1;
      setAttendance(counts);
    }
  }

  async function saveRemarks() {
    if (!cardFor) return;
    await run(() => db.from("report_remarks").upsert({ school_id: schoolId, enrollment_id: cardFor, term_id: termId, teacher_remark: remarkForm.teacher.trim() || null, head_remark: remarkForm.head.trim() || null }, { onConflict: "school_id,enrollment_id,term_id" }), "Remarks saved.");
  }

  function printCard(enrollmentId: string) {
    const s = studentOf(enrollmentId); const rank = rankings.find((r) => r.enrollment_id === enrollmentId);
    const rows = results.filter((r) => r.enrollment_id === enrollmentId).sort((a, b) => subjectName(a.subject_id).localeCompare(subjectName(b.subject_id)))
      .map((r) => `<tr><td>${esc(subjectName(r.subject_id))}</td><td class="r">${esc(r.total_percent)}</td><td>${esc(r.grade ?? "—")}</td><td>${esc(r.grade_remark ?? "")}</td></tr>`).join("");
    printHtml(`Report card - ${s?.last_name ?? ""}`, `<div class="row"><div><h1>${esc(schoolName)}</h1><div class="muted">Terminal report</div></div><div class="r">${esc(term?.name)}<br>${esc(classes.find((c) => c.id === classId)?.name)}</div></div>
      <h2>${esc(s ? `${s.first_name} ${s.last_name}` : "")} <span class="muted">(${esc(s?.admission_number)})</span></h2>
      <table><tr><th>Subject</th><th class="r">Total (%)</th><th>Grade</th><th>Remark</th></tr>${rows}</table>
      <p><b>Average:</b> ${esc(rank?.average_percent ?? "—")}% &nbsp; <b>Position:</b> ${rank ? `${rank.position} of ${rank.class_size}` : "—"}</p>
      <p><b>Attendance this term:</b> present ${attendance.present ?? 0}, late ${attendance.late ?? 0}, absent ${attendance.absent ?? 0}, excused ${attendance.excused ?? 0}</p>
      <p><b>Class teacher:</b> ${esc(remarkForm.teacher)}</p><p><b>Head teacher:</b> ${esc(remarkForm.head)}</p><p class="muted">Printed ${esc(fmtDate(new Date().toISOString()))}</p>`);
  }

  const weightBySubject = (sid: string) => assessments.filter((a) => a.subject_id === sid).reduce((s, a) => s + Number(a.weight_percent), 0);

  return (
    <div className="space-y-6">
      <Notice error={error} ok={ok} />
      <div className={`${card} grid gap-3 md:grid-cols-4`}>
        <div><label className={label}>Term</label><select className={field} value={termId} onChange={(e) => { setTermId(e.target.value); setAssessmentId(""); setCardFor(null); }}>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name} — {years.find((y) => y.id === t.academic_year_id)?.name}</option>)}</select></div>
        <div><label className={label}>Class</label><select className={field} value={classId} onChange={(e) => { setClassId(e.target.value); setAssessmentId(""); setCardFor(null); }}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "reports", label: "Report cards" }, { id: "scores", label: "Enter scores" }, { id: "assessments", label: "Assessments" }, { id: "scale", label: "Grading scale" }]} />

      {tab === "scale" && (
        <section className="space-y-4">
          {bands.length === 0 && canManage && <div className={card}><p className="mb-3 text-sm text-slate-600">No grading scale yet. Load the standard A1–F9 scale (you can edit it afterwards) or add bands yourself.</p>
            <button className={btn} disabled={busy} onClick={() => run(() => db.rpc("load_default_grading_scale", { p_school_id: schoolId }), "Default scale loaded.", "base")}>Load default scale</button></div>}
          {canManage && <form onSubmit={addBand} className={`${card} grid gap-3 md:grid-cols-5 md:items-end`}>
            <div><label className={label}>Grade</label><input className={field} required maxLength={6} value={bandForm.grade} onChange={(e) => setBandForm({ ...bandForm, grade: e.target.value })} /></div>
            <div><label className={label}>From (%)</label><input className={field} required inputMode="decimal" value={bandForm.min} onChange={(e) => setBandForm({ ...bandForm, min: e.target.value })} /></div>
            <div><label className={label}>To (%)</label><input className={field} required inputMode="decimal" value={bandForm.max} onChange={(e) => setBandForm({ ...bandForm, max: e.target.value })} /></div>
            <div><label className={label}>Remark</label><input className={field} required minLength={2} value={bandForm.remark} onChange={(e) => setBandForm({ ...bandForm, remark: e.target.value })} /></div>
            <button className={btn} disabled={busy}>Add band</button></form>}
          {bands.length === 0 ? <Empty>No grade bands.</Empty> : <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Grade</th><th className={th}>Range</th><th className={th}>Remark</th><th /></tr></thead>
            <tbody>{bands.map((b) => <tr key={b.id} className="border-b last:border-0"><td className={`${td} font-semibold`}>{b.grade}</td><td className={td}>{b.min_score} – {b.max_score}</td><td className={td}>{b.remark}</td>
              <td className={`${td} text-right`}>{canManage && <button className={btnLight} onClick={() => run(() => db.from("grading_scales").delete().eq("school_id", schoolId).eq("id", b.id), "Band removed.", "base")}>Remove</button>}</td></tr>)}</tbody></table></div>}
        </section>
      )}

      {tab === "assessments" && (
        <section className="space-y-4">
          {subjects.length === 0 ? <Empty>This class has no subjects yet. Assign subjects to the class under Academics first.</Empty> : <>
            {canManage && <form onSubmit={addAssessment} className={`${card} grid gap-3 md:grid-cols-6 md:items-end`}>
              <div><label className={label}>Subject</label><select className={field} value={af.subject_id} onChange={(e) => setAf({ ...af, subject_id: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="md:col-span-2"><label className={label}>Name</label><input className={field} required minLength={2} placeholder="Class test 1" value={af.name} onChange={(e) => setAf({ ...af, name: e.target.value })} /></div>
              <div><label className={label}>Type</label><select className={field} value={af.kind} onChange={(e) => setAf({ ...af, kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label className={label}>Out of</label><input className={field} required inputMode="decimal" value={af.max} onChange={(e) => setAf({ ...af, max: e.target.value })} /></div>
              <div><label className={label}>Weight (%)</label><input className={field} required inputMode="decimal" value={af.weight} onChange={(e) => setAf({ ...af, weight: e.target.value })} /></div>
              <div><label className={label}>Date</label><input type="date" className={field} value={af.on} onChange={(e) => setAf({ ...af, on: e.target.value })} /></div>
              <div className="md:col-span-5"><button className={btn} disabled={busy}>Create assessment</button></div></form>}
            {subjects.map((s) => { const list = assessments.filter((a) => a.subject_id === s.id); const w = weightBySubject(s.id);
              return <div key={s.id} className={`${card} p-0`}><div className="flex items-center justify-between border-b px-4 py-3"><h3 className="font-semibold">{s.name}</h3>
                <span className={`text-sm ${w === 100 ? "text-green-700" : "text-amber-700"}`}>{w}% of 100% allocated</span></div>
                {list.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">No assessments yet.</p> : <table className="w-full"><tbody>{list.map((a) => <tr key={a.id} className="border-b last:border-0">
                  <td className={td}>{a.name}<div className="text-xs text-slate-500">{KINDS.find((k) => k[0] === a.kind)?.[1]} · {fmtDate(a.assessed_on)}</div></td><td className={td}>out of {a.max_score}</td><td className={td}>{a.weight_percent}%</td>
                  <td className={`${td} text-right`}>{canManage && <button className={btnLight} onClick={() => run(() => db.from("assessments").update({ is_locked: !a.is_locked }).eq("school_id", schoolId).eq("id", a.id), a.is_locked ? "Assessment unlocked." : "Assessment locked. Scores can no longer change.")}>{a.is_locked ? "Unlock" : "Lock"}</button>}</td></tr>)}</tbody></table>}</div>; })}
          </>}
        </section>
      )}

      {tab === "scores" && (
        <section className="space-y-4">
          {assessments.length === 0 ? <Empty>Create an assessment first.</Empty> : <>
            <div className={card}><label className={label}>Assessment</label><select className={field} value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)}>
              <option value="">Choose…</option>{assessments.map((a) => <option key={a.id} value={a.id}>{subjectName(a.subject_id)} — {a.name} (out of {a.max_score}){a.is_locked ? " 🔒" : ""}</option>)}</select></div>
            {assessment && (sortedEnrollments.length === 0 ? <Empty>No students are enrolled in this class for the term&apos;s academic year.</Empty> :
              <div className={`${card} p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Student</th><th className={th}>Score (out of {assessment.max_score})</th></tr></thead>
                <tbody>{sortedEnrollments.map((e) => <tr key={e.id} className="border-b last:border-0"><td className={td}>{nameOf(e.id)}<div className="text-xs text-slate-500">{studentOf(e.id)?.admission_number}</div></td>
                  <td className={td}><input className={`${field} max-w-[9rem]`} inputMode="decimal" disabled={!canManage || assessment.is_locked} value={scoreInputs[e.id] ?? ""} onChange={(ev) => setScoreInputs({ ...scoreInputs, [e.id]: ev.target.value })} /></td></tr>)}</tbody></table>
                {canManage && !assessment.is_locked && <div className="border-t p-4"><button className={btn} disabled={busy} onClick={saveScores}>Save scores</button></div>}
                {assessment.is_locked && <p className="border-t p-4 text-sm text-amber-700">This assessment is locked.</p>}</div>)}
          </>}
        </section>
      )}

      {tab === "reports" && (
        <section className="space-y-4">
          {sortedEnrollments.length === 0 ? <Empty>No enrolled students for this class and term.</Empty> :
            <div className={`${card} overflow-x-auto p-0`}><table className="w-full"><thead className="border-b"><tr><th className={th}>Position</th><th className={th}>Student</th><th className={`${th} text-right`}>Average</th><th className={`${th} text-right`}>Subjects</th><th /></tr></thead>
              <tbody>{[...sortedEnrollments].sort((a, b) => (rankings.find((r) => r.enrollment_id === a.id)?.position ?? 999) - (rankings.find((r) => r.enrollment_id === b.id)?.position ?? 999)).map((e) => {
                const r = rankings.find((x) => x.enrollment_id === e.id);
                return <tr key={e.id} className="border-b last:border-0"><td className={td}>{r ? `${r.position} / ${r.class_size}` : "—"}</td><td className={td}>{nameOf(e.id)}</td><td className={`${td} text-right`}>{r ? `${r.average_percent}%` : "—"}</td><td className={`${td} text-right`}>{r?.subjects_counted ?? 0}</td>
                  <td className={`${td} text-right`}><button className={btnLight} onClick={() => openCard(e.id)}>Report card</button></td></tr>; })}</tbody></table></div>}
          {cardFor && (
            <div className={card}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{nameOf(cardFor)}</h3><p className="text-sm text-slate-600">{term?.name} · {classes.find((c) => c.id === classId)?.name}</p></div>
                <div className="flex gap-2"><button className={btnLight} onClick={() => printCard(cardFor)}>Print</button><button className={btnLight} onClick={() => setCardFor(null)}>Close</button></div></div>
              {results.filter((r) => r.enrollment_id === cardFor).length === 0 ? <Empty>No scores entered yet.</Empty> :
                <table className="w-full"><thead className="border-b"><tr><th className={th}>Subject</th><th className={`${th} text-right`}>Total (%)</th><th className={th}>Grade</th><th className={th}>Remark</th></tr></thead>
                  <tbody>{results.filter((r) => r.enrollment_id === cardFor).sort((a, b) => subjectName(a.subject_id).localeCompare(subjectName(b.subject_id))).map((r) => <tr key={r.subject_id} className="border-b last:border-0"><td className={td}>{subjectName(r.subject_id)}</td><td className={`${td} text-right`}>{r.total_percent}</td><td className={`${td} font-semibold`}>{r.grade ?? "—"}</td><td className={td}>{r.grade_remark}</td></tr>)}</tbody></table>}
              <p className="mt-3 text-sm text-slate-600">Attendance this term — present {attendance.present ?? 0}, late {attendance.late ?? 0}, absent {attendance.absent ?? 0}, excused {attendance.excused ?? 0}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div><label className={label}>Class teacher&apos;s remark</label><textarea className={field} rows={3} maxLength={400} disabled={!canManage} value={remarkForm.teacher} onChange={(e) => setRemarkForm({ ...remarkForm, teacher: e.target.value })} /></div>
                <div><label className={label}>Head teacher&apos;s remark</label><textarea className={field} rows={3} maxLength={400} disabled={!canManage} value={remarkForm.head} onChange={(e) => setRemarkForm({ ...remarkForm, head: e.target.value })} /></div></div>
              {canManage && <div className="mt-3"><button className={btn} disabled={busy} onClick={saveRemarks}>Save remarks</button></div>}
            </div>)}
        </section>
      )}
    </div>
  );
}
