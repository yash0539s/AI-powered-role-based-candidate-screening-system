"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, ArrowUpRight, CheckCircle2, FileText, Gauge, Inbox, Layers, MessagesSquare,
  Plus, Search, SearchX, Trash2, X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { SessionSummary } from "@/lib/types";
import { ErrorAlert, initials, PageHeader, ScoreBadge, scoreTone } from "@/components/common";
import styles from "./sessions.module.css";

type Filter = "all" | "active" | "completed";

const FILTER_LABEL: Record<Filter, string> = { all: "All", active: "Active", completed: "Completed" };
const DAY_MS = 86_400_000;
const STATUS_LABEL: Record<string, string> = { completed: "Completed", in_progress: "In progress", planned: "Planned" };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: d > 300 ? "numeric" : undefined });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function StatusPill({ status }: { status: string }) {
  if (status === "completed") {
    return <span className={`badge good ${styles.pill}`}><span className="dot" /> Completed</span>;
  }
  if (status === "in_progress") {
    return <span className={`badge primary ${styles.pill} ${styles.live}`}><span className="dot" /> In progress</span>;
  }
  return <span className={`badge ${styles.pill}`}><span className="dot" /> Planned</span>;
}

/** Sessions created per local calendar day over the last 7 days (oldest first). */
function lastSevenDays(rows: SessionSummary[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 6 * DAY_MS;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start + i * DAY_MS);
    return { label: d.toLocaleDateString(undefined, { weekday: "short" }), count: 0 };
  });
  for (const r of rows) {
    const t = new Date(r.created_at);
    t.setHours(0, 0, 0, 0);
    const idx = Math.round((t.getTime() - start) / DAY_MS);
    if (idx >= 0 && idx < 7) days[idx].count += 1;
  }
  return days;
}

function WeekBars({ days }: { days: { label: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((t, d) => t + d.count, 0);
  const W = 7 * 10 - 4;
  const H = 28;
  return (
    <svg
      className={styles.spark}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${total} sessions created in the last 7 days`}
    >
      {days.map((d, i) => {
        const h = d.count ? Math.max(4, (d.count / max) * H) : 2;
        return (
          <rect
            key={i}
            x={i * 10}
            y={H - h}
            width={6}
            height={h}
            rx={2}
            className={d.count ? (i === 6 ? styles.sparkToday : styles.sparkBar) : styles.sparkEmpty}
          >
            <title>{`${d.label}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function ScoreDistribution({ scores }: { scores: number[] }) {
  const buckets = { good: 0, warn: 0, bad: 0 };
  scores.forEach((s) => { buckets[scoreTone(s)] += 1; });
  const total = scores.length || 1;
  const items = [
    { tone: "good", label: "Strong", n: buckets.good },
    { tone: "warn", label: "Mixed", n: buckets.warn },
    { tone: "bad", label: "Weak", n: buckets.bad },
  ] as const;
  return (
    <div className={styles.dist}>
      <div
        className={styles.distBar}
        role="img"
        aria-label={`Score distribution: ${buckets.good} strong, ${buckets.warn} mixed, ${buckets.bad} weak`}
      >
        {items.map((it) => it.n > 0 && (
          <span key={it.tone} className={styles[`seg_${it.tone}`]} style={{ flexGrow: it.n / total }} />
        ))}
      </div>
      <div className={styles.distLegend} aria-hidden>
        {items.map((it) => (
          <span key={it.tone}><i className={styles[`seg_${it.tone}`]} />{it.n} {it.label.toLowerCase()}</span>
        ))}
      </div>
    </div>
  );
}

export default function SessionsPage() {
  const [rows, setRows] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Sessions · ScreenIQ";
    api.listSessions().then(setRows).catch((e: ApiError) => setError(e.message));
  }, []);

  const visible = useMemo(() => (rows ?? []).filter((s) => {
    if (filter === "completed" && s.status !== "completed") return false;
    if (filter === "active" && s.status === "completed") return false;
    const q = query.trim().toLowerCase();
    return !q || s.candidate_name.toLowerCase().includes(q) || s.role_title.toLowerCase().includes(q);
  }), [rows, query, filter]);

  const week = useMemo(() => lastSevenDays(rows ?? []), [rows]);
  const weekTotal = week.reduce((t, d) => t + d.count, 0);

  const completed = rows?.filter((s) => s.status === "completed") ?? [];
  const inProgress = rows?.filter((s) => s.status === "in_progress").length ?? 0;
  const scored = completed.filter((s) => s.overall_score != null);
  const scores = scored.map((s) => s.overall_score as number);
  const avg = scores.length ? scores.reduce((t, s) => t + s, 0) / scores.length : null;
  const counts: Record<Filter, number> = {
    all: rows?.length ?? 0,
    active: (rows?.length ?? 0) - completed.length,
    completed: completed.length,
  };
  const completionRate = rows && rows.length ? Math.round((completed.length / rows.length) * 100) : 0;

  async function remove(id: string) {
    if (confirming !== id) { setConfirming(id); return; }
    try {
      await api.deleteSession(id);
      setRows((r) => r?.filter((x) => x.id !== id) ?? null);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setConfirming(null);
    }
  }

  const loading = rows === null && !error;
  const hasRows = !!rows && rows.length > 0;
  const filtered = query.trim() !== "" || filter !== "all";

  return (
    <div className="fade-in">
      <PageHeader
        title="Sessions"
        subtitle="Every screening with its full question → answer → evaluation trail."
        actions={<Link href="/" className="btn btn-primary"><Plus size={16} /> New screening</Link>}
      />

      <div className="stack">
        {error && <ErrorAlert message={error} />}

        {/* ---------------------------------------------------------- KPI strip */}
        <section className={`card ${styles.kpis}`} aria-label="Summary" aria-busy={loading}>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}><Layers size={14} aria-hidden /> Total sessions</div>
            {loading ? <KpiSkeleton /> : (
              <div className={styles.kpiMain}>
                <div className={styles.kpiValue}>{rows ? rows.length : "—"}</div>
                {rows && <WeekBars days={week} />}
              </div>
            )}
            <div className={styles.kpiFoot}>
              {rows ? (weekTotal ? <><span className={styles.up}><ArrowUpRight size={12} aria-hidden />{weekTotal}</span> in the last 7 days</> : "None in the last 7 days") : " "}
            </div>
          </div>

          <div className={styles.kpi}>
            <div className={styles.kpiLabel}><CheckCircle2 size={14} aria-hidden /> Completed</div>
            {loading ? <KpiSkeleton /> : (
              <div className={styles.kpiMain}>
                <div className={styles.kpiValue}>{rows ? completed.length : "—"}</div>
              </div>
            )}
            <div className={styles.kpiFoot}>
              {rows ? (
                <span className={styles.rate}>
                  <span
                    className={`progress ${styles.rateBar}`}
                    role="progressbar"
                    aria-label="Completion rate"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={completionRate}
                  >
                    <div style={{ width: `${completionRate}%` }} />
                  </span>
                  <span className="nums">{completionRate}%</span> completion
                </span>
              ) : " "}
            </div>
          </div>

          <div className={styles.kpi}>
            <div className={styles.kpiLabel}><Activity size={14} aria-hidden /> In progress</div>
            {loading ? <KpiSkeleton /> : (
              <div className={styles.kpiMain}>
                <div className={styles.kpiValue}>{rows ? counts.active : "—"}</div>
              </div>
            )}
            <div className={styles.kpiFoot}>
              {rows ? <><span className="nums">{inProgress}</span> interviewing · <span className="nums">{counts.active - inProgress}</span> planned</> : " "}
            </div>
          </div>

          <div className={`${styles.kpi} ${styles.kpiScore}`}>
            <div className={styles.kpiLabel}><Gauge size={14} aria-hidden /> Average score</div>
            {loading ? <KpiSkeleton /> : (
              <div className={styles.kpiMain}>
                <div className={`${styles.kpiValue} ${avg != null ? styles[`tone_${scoreTone(avg)}`] : ""}`}>
                  {avg != null ? <>{avg.toFixed(1)}<span className={styles.kpiUnit}>/ 10</span></> : "—"}
                </div>
              </div>
            )}
            <div className={styles.kpiFoot}>
              {scores.length > 0 ? <ScoreDistribution scores={scores} /> : rows ? "No scored reports yet" : " "}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- Table card */}
        <section className={`card ${styles.tableCard}`} aria-label="Sessions">
          <div className={`card-header ${styles.toolbar}`}>
            <div className={styles.search}>
              <Search size={15} className={styles.searchIcon} aria-hidden />
              <input
                className={`input ${styles.searchInput}`}
                type="search"
                placeholder="Search candidate or role…"
                aria-label="Search sessions"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <span className="spacer" />
            <div className={`segmented ${styles.segmented}`} role="tablist" aria-label="Filter by status">
              {(["all", "active", "completed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  className={filter === f ? "active" : ""}
                  onClick={() => setFilter(f)}
                >
                  {FILTER_LABEL[f]}
                  {rows && <span className={styles.segCount}>{counts[f]}</span>}
                </button>
              ))}
            </div>
          </div>

          {rows && rows.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyArt} aria-hidden>
                <span className={styles.emptyGlow} />
                <span className={styles.emptyIcon}><Inbox size={22} /></span>
              </div>
              <h3 className={styles.emptyTitle}>No screenings yet</h3>
              <p className={styles.emptyText}>
                Upload a resume and pick a role. ScreenIQ plans the interview, asks adaptive questions and
                writes an evidence-backed report.
              </p>
              <ol className={styles.emptySteps}>
                <li><span className={styles.stepIcon}><FileText size={14} aria-hidden /></span>Analyse resume</li>
                <li><span className={styles.stepIcon}><MessagesSquare size={14} aria-hidden /></span>Run interview</li>
                <li><span className={styles.stepIcon}><Gauge size={14} aria-hidden /></span>Review report</li>
              </ol>
              <Link href="/" className="btn btn-primary"><Plus size={16} /> New screening</Link>
            </div>
          )}

          {hasRows && visible.length === 0 && (
            <div className={`${styles.empty} ${styles.emptyCompact}`}>
              <span className={`icon-tile ${styles.noMatchIcon}`}><SearchX size={18} aria-hidden /></span>
              <h3 className={styles.emptyTitle}>No matches</h3>
              <p className={styles.emptyText}>
                No sessions match {query.trim() ? <>“<span className={styles.q}>{query.trim()}</span>”</> : "this filter"}
                {query.trim() && filter !== "all" ? <> in {FILTER_LABEL[filter].toLowerCase()}</> : null}.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setQuery(""); setFilter("all"); }}
              >
                <X size={14} aria-hidden /> Clear filters
              </button>
            </div>
          )}

          {error && rows === null && (
            <div className={`${styles.empty} ${styles.emptyCompact}`}>
              <span className={`icon-tile ${styles.noMatchIcon}`}><Inbox size={18} aria-hidden /></span>
              <h3 className={styles.emptyTitle}>Sessions unavailable</h3>
              <p className={styles.emptyText}>The session list could not be loaded. Check that the API is running, then reload.</p>
            </div>
          )}

          {(loading || visible.length > 0) && (
            <div className="table-wrap">
              <table className={`table ${styles.table}`} aria-busy={loading}>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th className={styles.hideSm}>Role</th>
                    <th className={styles.hideXs}>Status</th>
                    <th className={`${styles.right} ${styles.hideMd}`}>Progress</th>
                    <th className={styles.right}>Score</th>
                    <th className={`${styles.right} ${styles.hideSm}`}>Created</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && [0, 1, 2, 3, 4].map((i) => (
                    <tr key={i} aria-hidden className={styles.skelRow} style={{ animationDelay: `${i * 60}ms` }}>
                      <td>
                        <div className={styles.candidate}>
                          <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div className="skeleton" style={{ height: 12, width: 120 - i * 8 }} />
                            <div className="skeleton mt-2" style={{ height: 10, width: 72 }} />
                          </div>
                        </div>
                      </td>
                      <td className={styles.hideSm}><div className="skeleton" style={{ height: 12, width: 132 - i * 6 }} /></td>
                      <td className={styles.hideXs}><div className="skeleton" style={{ height: 22, width: 92, borderRadius: 999 }} /></td>
                      <td className={styles.hideMd}><div className="skeleton" style={{ height: 6, width: 110, marginLeft: "auto", borderRadius: 999 }} /></td>
                      <td><div className="skeleton" style={{ height: 22, width: 38, marginLeft: "auto" }} /></td>
                      <td className={styles.hideSm}><div className="skeleton" style={{ height: 12, width: 52, marginLeft: "auto" }} /></td>
                      <td><div className="skeleton" style={{ height: 28, width: 92, marginLeft: "auto" }} /></td>
                    </tr>
                  ))}

                  {!loading && visible.map((s) => {
                    const pct = s.num_questions ? Math.min(100, (s.answered / s.num_questions) * 100) : 0;
                    const isConfirming = confirming === s.id;
                    const done = s.status === "completed";
                    return (
                      <tr key={s.id} className={isConfirming ? styles.rowDanger : undefined}>
                        <td className={styles.candidateCell}>
                          <Link href={`/session/${s.id}`} className={styles.candidate}>
                            <span className={styles.avatarWrap} aria-hidden>
                              <span className={`avatar ${styles.avatar}`}>{initials(s.candidate_name)}</span>
                              <span className={`${styles.avatarDot} ${styles[`st_${s.status}`] ?? ""}`} />
                            </span>
                            <span className={styles.candidateText}>
                              <span className={`truncate ${styles.candidateName}`}>{s.candidate_name}</span>
                              <span className={`truncate ${styles.candidateSub}`}>
                                <span className={styles.showSm}>
                                  <span className="sr-only">{STATUS_LABEL[s.status] ?? "Planned"}, </span>
                                  {s.role_title} ·{" "}
                                </span>
                                <time dateTime={s.created_at} title={fullDate(s.created_at)} className={styles.showSm}>
                                  {relativeTime(s.created_at)}
                                </time>
                                <span className={styles.hideSmInline}>{s.num_questions} questions</span>
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className={`${styles.role} ${styles.hideSm}`}>
                          <span className="truncate">{s.role_title}</span>
                        </td>
                        <td className={styles.hideXs}><StatusPill status={s.status} /></td>
                        <td className={`${styles.progressCell} ${styles.hideMd}`}>
                          <div className={styles.progressRow}>
                            <div
                              className={`progress ${styles.progressBar} ${done ? styles.progressDone : ""}`}
                              role="progressbar"
                              aria-label={`${s.answered} of ${s.num_questions} questions answered`}
                              aria-valuemin={0}
                              aria-valuemax={s.num_questions}
                              aria-valuenow={s.answered}
                            >
                              <div style={{ width: `${pct}%` }} />
                            </div>
                            <span className={styles.progressText}>{s.answered}/{s.num_questions}</span>
                          </div>
                        </td>
                        <td className={styles.right}>
                          {s.overall_score != null
                            ? <ScoreBadge score={s.overall_score} />
                            : <span className="faint" aria-label="No score">—</span>}
                        </td>
                        <td className={`${styles.created} ${styles.right} ${styles.hideSm}`}>
                          <time dateTime={s.created_at} title={fullDate(s.created_at)}>{relativeTime(s.created_at)}</time>
                        </td>
                        <td>
                          <div className={styles.actions}>
                            <Link
                              href={`/session/${s.id}`}
                              className={`btn btn-ghost btn-sm ${styles.openBtn}`}
                              aria-label={`${done ? "View report" : "Open session"} for ${s.candidate_name}`}
                            >
                              <span className={styles.openLabel}>{done ? "Report" : "Open"}</span> <ArrowRight size={14} aria-hidden />
                            </Link>
                            <button
                              type="button"
                              className={`btn btn-danger btn-sm ${isConfirming ? styles.confirm : `btn-icon ${styles.deleteBtn}`}`}
                              onClick={() => remove(s.id)}
                              onBlur={() => setConfirming(null)}
                              aria-label={isConfirming ? `Confirm delete session for ${s.candidate_name}` : `Delete session for ${s.candidate_name}`}
                              title={isConfirming ? "Click again to delete" : "Delete"}
                            >
                              <Trash2 size={14} aria-hidden />
                              {isConfirming && "Confirm"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasRows && visible.length > 0 && (
            <div className={styles.footer} aria-live="polite">
              <span>
                Showing <span className="nums">{visible.length}</span> of <span className="nums">{rows!.length}</span>
                {filtered ? " (filtered)" : ""}
              </span>
              <span className={styles.footerHint}>Times shown in your local timezone</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className={styles.kpiMain}>
      <div className="skeleton" style={{ height: 26, width: 56, margin: "4px 0" }} />
    </div>
  );
}
