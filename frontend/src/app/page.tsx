"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BookOpen, Check, FileSearch, FileText, Library, MessagesSquare, Route, ShieldCheck, Sparkles, Upload, UserRound, X,
} from "lucide-react";
import { ErrorAlert, PageHeader, Spinner } from "@/components/common";
import RoleSelect from "@/components/RoleSelect";
import Stepper from "@/components/Stepper";
import { api, ApiError } from "@/lib/api";
import type { Role } from "@/lib/types";
import styles from "./setup.module.css";

/** Pipeline steps — shown as "How it works" when idle and as live progress while busy. */
const STEPS = [
  { title: "Parse resume", desc: "Extract skills, technologies, concepts and projects.", icon: FileSearch },
  { title: "Plan topics", desc: "Map the background to the role's knowledge areas.", icon: Route },
  { title: "Retrieve from textbooks", desc: "Hybrid search finds the passages for each topic.", icon: Library },
  { title: "Adaptive interview & report", desc: "Difficulty follows every answer; scored report at the end.", icon: MessagesSquare },
];

const QUESTION_OPTIONS = [4, 6, 8, 10];
const MAX_BYTES = 5 * 1024 * 1024;

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fileExt(name: string): string {
  return (name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
}

export default function SetupPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [roleId, setRoleId] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [numQuestions, setNumQuestions] = useState(6);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.roles()
      .then((r) => {
        setRoles(r);
        setRoleId((cur) => cur || r.find((x) => x.ready)?.id || "");
      })
      .catch((e: ApiError) => { setRoles([]); setError(e.message); });
  }, []);

  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(t);
  }, [busy]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!/\.(pdf|txt|md)$/i.test(f.name)) return setError("Unsupported file type. Upload a PDF or .txt resume.");
    if (f.size > MAX_BYTES) return setError("Resume must be smaller than 5 MB.");
    setError(null);
    setFile(f);
  }

  async function submit() {
    if (!file || !roleId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const s = await api.createSession({ resume: file, roleId, name: name.trim(), numQuestions });
      router.push(`/session/${s.id}`);
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  }

  const role = roles?.find((r) => r.id === roleId);
  const canSubmit = !!file && !!roleId && !busy;
  const minutes = Math.round(numQuestions * 2.5);

  const corpus = useMemo(() => {
    const books = new Map<string, number>();
    roles?.forEach((r) => r.books.forEach((b) => { if (b.chunks > 0) books.set(b.id, b.chunks); }));
    let passages = 0;
    books.forEach((n) => { passages += n; });
    const perRole = (roles ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      passages: r.books.reduce((t, b) => t + b.chunks, 0),
    }));
    const maxRole = Math.max(1, ...perRole.map((r) => r.passages));
    return { books: books.size, passages, perRole, maxRole };
  }, [roles]);

  const roleBooks = role?.books.filter((b) => b.chunks > 0).map((b) => b.title) ?? [];
  const progress = busy ? ((stage + 1) / STEPS.length) * 100 : 0;

  return (
    <div className="fade-in">
      <Stepper current={0} />
      <PageHeader
        eyebrow={<><Sparkles size={13} aria-hidden /> AI technical screening</>}
        title="New screening"
        subtitle="Turn a resume into an adaptive technical interview — every question grounded in the role's textbooks and scored with evidence."
      />

      {error && <div className="mb-4"><ErrorAlert message={error} /></div>}

      <div className={styles.layout}>
        {/* ------------------------------------------------------------ form */}
        <section className={`card accent ${styles.form}`} aria-label="Screening setup" aria-busy={busy}>
          {busy && <div className={`progress thin indeterminate ${styles.busyBar}`} aria-hidden><div /></div>}

          {/* 1 · Role */}
          <div className={styles.section}>
            <SectionHead n={1} done={!!role} title="Role" desc="Decides which textbooks the questions come from." id="role-label" />
            <div className={styles.control}>
              <RoleSelect roles={roles} value={roleId} onChange={setRoleId} disabled={busy} />
              {role && roleBooks.length > 0 && (
                <p className={styles.sourceHint} title={roleBooks.join(" · ")}>
                  <BookOpen size={13} aria-hidden />
                  <span className="truncate"><span className="muted">Questions from:</span> {roleBooks.join(" · ")}</span>
                </p>
              )}
            </div>
          </div>

          {/* 2 · Resume */}
          <div className={styles.section}>
            <SectionHead n={2} done={!!file} title="Resume" desc="PDF or plain text, parsed into skills, technologies and projects." />
            <div className={styles.control}>
              <input
                ref={inputRef} type="file" accept=".pdf,.txt,.md" hidden
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
              />
              {file ? (
                <div className={`${styles.fileRow} fade-in`}>
                  <span className={styles.fileIcon} aria-hidden>
                    <FileText size={18} />
                    <span className={styles.fileExt}>{fileExt(file.name)}</span>
                  </span>
                  <div className={styles.fileMeta}>
                    <div className={`${styles.fileName} truncate`} title={file.name}>{file.name}</div>
                    <div className={styles.fileSub}>
                      <span className="nums">{formatSize(file.size)}</span>
                      <span className={styles.ready}><Check size={12} strokeWidth={3} aria-hidden /> Ready to analyse</span>
                    </div>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                    Replace
                  </button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={busy} onClick={() => setFile(null)} aria-label="Remove file">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  className={`${styles.dropzone} ${drag ? styles.dropzoneActive : ""}`}
                  role="button" tabIndex={0} aria-label="Upload resume: drop a PDF or TXT, or browse"
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); }
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); }}
                >
                  <span className={styles.dropIcon}><Upload size={18} /></span>
                  <div className={styles.dropText}>
                    <span className="medium">{drag ? "Release to upload" : "Drop a resume here"}</span>
                    <span className="muted"> or </span>
                    <span className={styles.browse}>browse files</span>
                  </div>
                  <div className={styles.formats} aria-hidden>
                    <span>PDF</span><span>TXT</span><span>MD</span><span className={styles.formatSize}>up to 5 MB</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3 · Settings */}
          <div className={styles.section}>
            <SectionHead n={3} done title="Interview" desc="Name is optional; question count sets the length." />
            <div className={`${styles.control} ${styles.settings}`}>
              <div>
                <label className="label" htmlFor="candidate-name">
                  Candidate name <span className="optional">Optional</span>
                </label>
                <div className="input-group">
                  <UserRound size={15} aria-hidden />
                  <input
                    id="candidate-name" className="input" value={name} disabled={busy}
                    onChange={(e) => setName(e.target.value)} placeholder="Read from resume" autoComplete="off"
                  />
                </div>
              </div>
              <div>
                <span className="label" id="questions-label">Questions</span>
                <div className="segmented" role="radiogroup" aria-labelledby="questions-label">
                  {QUESTION_OPTIONS.map((n) => (
                    <button
                      key={n} type="button" role="radio" aria-checked={numQuestions === n} disabled={busy}
                      className={`nums ${numQuestions === n ? "active" : ""}`} onClick={() => setNumQuestions(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="hint nums">About {minutes} min, incl. adaptive follow-ups.</p>
              </div>
            </div>
          </div>

          <div className={`card-footer ${styles.footer}`}>
            <ul className={styles.checklist} aria-label="Ready check">
              <CheckItem ok={!!role} label={role?.title ?? "Choose a role"} />
              <CheckItem ok={!!file} label={file ? "Resume attached" : "Add a resume"} />
              <CheckItem ok label={`${numQuestions} questions`} />
            </ul>
            <button type="button" className={`btn btn-primary btn-lg ${styles.cta}`} disabled={!canSubmit} onClick={submit}>
              {busy ? <><Spinner light /> Analysing…</> : <>Analyse resume <ArrowRight size={16} /></>}
            </button>
          </div>
        </section>

        {/* ------------------------------------------------------------ aside */}
        <aside className={styles.aside}>
          <section className={`card ${busy ? styles.liveCard : ""}`} aria-live="polite">
            <div className="card-header">
              <h3>{busy ? "Building interview" : "How it works"}</h3>
              {busy ? (
                <span className="badge primary nums">{stage + 1} / {STEPS.length}</span>
              ) : (
                <span className="text-xs muted">~1 min setup</span>
              )}
            </div>
            {busy && (
              <div className={styles.liveProgress}>
                <div className="progress" aria-hidden><div style={{ width: `${progress}%` }} /></div>
              </div>
            )}
            <ol className={styles.steps}>
              {STEPS.map((s, i) => {
                const state = !busy ? "idle" : i < stage ? "done" : i === stage ? "active" : "pending";
                const Icon = s.icon;
                return (
                  <li key={s.title} className={`${styles.step} ${styles[state]}`}>
                    <span className={styles.marker} aria-hidden>
                      {state === "idle" && <Icon size={15} />}
                      {state === "done" && <Check size={14} strokeWidth={3} />}
                      {state === "active" && <Spinner light />}
                      {state === "pending" && <Icon size={15} />}
                    </span>
                    <div className={styles.stepText}>
                      <div className={styles.stepTitle}>{s.title}</div>
                      <div className={styles.stepDesc}>{s.desc}</div>
                    </div>
                    {busy && <span className="sr-only">{state === "done" ? "Done" : state === "active" ? "In progress" : "Pending"}</span>}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className={`card ${styles.corpus}`} aria-label="Knowledge base">
            <div className={styles.corpusHead}>
              <span className="icon-tile primary"><Library size={16} /></span>
              <div>
                <div className={styles.corpusLabel}>Grounded in textbooks</div>
                {roles === null ? (
                  <div className="skeleton" style={{ height: 24, width: 96, marginTop: 4 }} />
                ) : (
                  <div className={styles.corpusValue}>
                    <span className="nums">{corpus.passages.toLocaleString()}</span>
                    <span className={styles.corpusUnit}>passages · {corpus.books} {corpus.books === 1 ? "book" : "books"}</span>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.roleBars}>
              {roles === null
                ? [0, 1, 2].map((i) => <div key={i} className="skeleton text" style={{ width: `${90 - i * 15}%` }} />)
                : corpus.perRole.map((r) => (
                  <div key={r.id} className={`${styles.roleBar} ${r.id === roleId ? styles.roleBarActive : ""}`}>
                    <div className={styles.roleBarTop}>
                      <span className="truncate">{r.title}</span>
                      <span className="nums">{r.passages.toLocaleString()}</span>
                    </div>
                    <div className="meter"><div style={{ width: `${(r.passages / corpus.maxRole) * 100}%` }} /></div>
                  </div>
                ))}
            </div>
            <p className={styles.trust}>
              <ShieldCheck size={14} aria-hidden />
              Every question links to the exact passages it was generated from.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SectionHead({ n, title, desc, id, done }: { n: number; title: string; desc?: string; id?: string; done?: boolean }) {
  return (
    <div className={styles.sectionHead}>
      <span className={`${styles.sectionNum} ${done ? styles.sectionDone : ""}`} aria-hidden>
        {done ? <Check size={12} strokeWidth={3} /> : n}
      </span>
      <div>
        <h3 id={id}>{title}</h3>
        {desc && <p className={styles.sectionDesc}>{desc}</p>}
      </div>
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`${styles.checkItem} ${ok ? styles.checkOk : ""}`}>
      <span className={styles.checkDot} aria-hidden>{ok && <Check size={10} strokeWidth={3.5} />}</span>
      <span className="truncate">{label}</span>
      <span className="sr-only">{ok ? "(done)" : "(missing)"}</span>
    </li>
  );
}
