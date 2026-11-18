"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, BookOpen, Calendar, CheckCircle2, ChevronDown, Clock, Download, FileText, Gauge, Hash,
  ListChecks, MessageSquareText, Plus, Printer, Scale, Sparkles, Target, Timer, XCircle,
} from "lucide-react";
import type { ReportContent, SessionDetail } from "@/lib/types";
import {
  Difficulty, initials, PageHeader, QUESTION_TYPE_LABEL, ScoreBadge, ScoreRing, scoreTone, Sources, VERDICT_LABEL,
} from "./common";
import s from "./Report.module.css";

type Analytics = ReportContent["analytics"];
type TrajectoryPoint = Analytics["trajectory"][number];
type Tone = ReturnType<typeof scoreTone>;

const REC = {
  advance: { label: "Advance to next round", short: "Advance", tone: "good", Icon: CheckCircle2 },
  consider: { label: "Borderline — consider", short: "Consider", tone: "warn", Icon: AlertTriangle },
  do_not_advance: { label: "Do not advance", short: "Do not advance", tone: "bad", Icon: XCircle },
} as const;

const TONE_CLASS: Record<Tone, string> = { good: s.toneGood, warn: s.toneWarn, bad: s.toneBad };

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const fmtSecs = (sec: number) => {
  const r = Math.round(sec);
  return r < 60 ? `${r} s` : `${Math.floor(r / 60)}m ${String(r % 60).padStart(2, "0")}s`;
};

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;

/* ------------------------------------------------------------------ chart */

/** Tracks an element's content width so SVG text stays at true pixel size. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => { if (el.clientWidth > 0) setWidth(el.clientWidth); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Path for a bar with only the top corners rounded. */
function topRoundedBar(x: number, y: number, w: number, h: number, radius = 3) {
  const r = Math.max(0, Math.min(radius, h, w / 2));
  const b = y + h;
  return `M${x},${b}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${b}Z`;
}

interface QMeta { topic: string; parent: number | null }

/** Tooltip width in px — keep in sync with `.tip` in Report.module.css. */
const TIP_W = 196;

/**
 * Bars = score per question (left axis 0–10); line = difficulty (right axis 0–5), on shared gridlines.
 * Hover / touch shows a tooltip; a visually-hidden table carries the same data for screen readers.
 */
function TrajectoryChart({ points, average, meta }: {
  points: TrajectoryPoint[];
  average: number;
  meta: Map<number, QMeta>;
}) {
  const [ref, measured] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const gid = `traj${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const W = Math.max(300, measured);
  const H = 288;
  const padL = 40, padR = 44, padT = 30, padB = 50;
  const plotH = H - padT - padB;
  const base = H - padB;
  const step = (W - padL - padR) / points.length;
  const barW = Math.max(6, Math.min(30, step * 0.46));
  const yScore = (v: number) => base - (Math.max(0, Math.min(10, v)) / 10) * plotH;
  const yDiff = (v: number) => base - (Math.max(0, Math.min(5, v)) / 5) * plotH;
  const cx = (i: number) => padL + step * i + step / 2;
  const line = points.map((p, i) => `${i ? "L" : "M"}${cx(i)},${yDiff(p.difficulty)}`).join("");
  const area = `${line}L${cx(points.length - 1)},${base}L${cx(0)},${base}Z`;
  const fuLabel = step >= 58 ? "follow-up" : "f/u";
  const showEvery = step < 28 ? Math.ceil(28 / step) : 1;
  const avgY = yScore(average);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor((x - padL) / step);
    setHover(i >= 0 && i < points.length ? i : null);
  }

  const hp = hover != null ? points[hover] : null;
  const prev = hover != null && hover > 0 ? points[hover - 1] : null;
  const tipRight = hover != null && cx(hover) < W * 0.55;
  const hm = hp ? meta.get(hp.position) : undefined;

  return (
    <div ref={ref} className={s.chartBox}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={s.chartText} aria-hidden
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove}>
        <defs>
          <linearGradient id={`${gid}a`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* axis titles */}
        <text x={padL - 10} y={12} textAnchor="end" fontSize="10.5" fontWeight="500" fill="var(--chart-axis, var(--muted))">SCORE</text>
        <text x={W - padR + 10} y={12} fontSize="10.5" fontWeight="500" fill="var(--chart-axis, var(--muted))">DIFF.</text>

        {/* hover column */}
        {hover != null && (
          <rect x={padL + step * hover + 2} y={padT - 8} width={Math.max(0, step - 4)} height={plotH + 8} rx="6"
            fill="var(--primary-soft)" />
        )}

        {/* gridlines + paired axis ticks (score v ↔ difficulty v/2) */}
        {[0, 2, 4, 6, 8, 10].map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yScore(v)} y2={yScore(v)}
              stroke={v === 0 ? "var(--border-strong)" : "var(--chart-grid)"} strokeWidth="1"
              strokeDasharray={v === 0 ? undefined : "2 4"} shapeRendering="crispEdges" />
            <text x={padL - 10} y={yScore(v) + 4} textAnchor="end" fontSize="11" fill="var(--chart-axis, var(--muted))">{v}</text>
            <text x={W - padR + 10} y={yScore(v) + 4} fontSize="11" fill="var(--chart-axis, var(--muted))">{v / 2}</text>
          </g>
        ))}

        {/* score bars */}
        {points.map((p, i) => {
          const y = yScore(p.score);
          const h = Math.max(2, base - y);
          const fu = p.kind === "follow_up";
          const dim = hover != null && hover !== i;
          return (
            <g key={`b${p.position}`}>
              <path d={topRoundedBar(cx(i) - barW / 2, base - h, barW, h, 4)} fill={`var(--${scoreTone(p.score)}-strong)`}
                opacity={dim ? 0.35 : 0.9} className={s.bar} />
              {i % showEvery === 0 && (
                <>
                  <text x={cx(i)} y={base + 18} textAnchor="middle" fontSize="11" fontWeight={hover === i ? 600 : 400}
                    fill={hover === i ? "var(--text)" : "var(--chart-axis, var(--muted))"}>Q{p.position}</text>
                  {fu && <text x={cx(i)} y={base + 33} textAnchor="middle" fontSize="10" fontWeight="500" fill="var(--primary)">{fuLabel}</text>}
                </>
              )}
            </g>
          );
        })}

        {/* mean score reference */}
        <line x1={padL} x2={W - padR} y1={avgY} y2={avgY} stroke="var(--text-2)" strokeOpacity="0.55" strokeWidth="1"
          strokeDasharray="5 4" shapeRendering="crispEdges" />
        <text x={W - padR - 4} y={avgY - 6} textAnchor="end" fontSize="10.5" fontWeight="500" fill="var(--text-2)"
          stroke="var(--surface)" strokeWidth="4" strokeLinejoin="round" style={{ paintOrder: "stroke" }}>
          mean {average.toFixed(1)}
        </text>

        {/* difficulty line */}
        <path d={area} fill={`url(#${gid}a)`} />
        <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={`d${p.position}`} cx={cx(i)} cy={yDiff(p.difficulty)} r={hover === i ? 5.5 : 4}
            fill="var(--surface)" stroke="var(--chart-1)" strokeWidth={hover === i ? 2.5 : 2} className={s.dot} />
        ))}
      </svg>

      {hp && hover != null && (
        <div className={s.tip} role="presentation"
          style={tipRight
            ? { left: Math.max(0, Math.min(cx(hover) + step / 2 + 4, W - TIP_W)), top: padT - 6 }
            : { left: Math.min(W, Math.max(cx(hover) - step / 2 - 4, TIP_W)), top: padT - 6, transform: "translateX(-100%)" }}>
          <div className={s.tipHead}>
            <span className={s.tipQ}>Q{hp.position}</span>
            {hp.kind === "follow_up" && <span className={s.tipFu}>Follow-up{hm?.parent ? ` to Q${hm.parent}` : ""}</span>}
          </div>
          {hm?.topic && <div className={s.tipTopic}>{hm.topic}</div>}
          <div className={s.tipRow}>
            <span className={s.tipKey}><i style={{ background: `var(--${scoreTone(hp.score)}-strong)` }} />Score</span>
            <span className={s.tipVal}>{hp.score.toFixed(1)}<span> / 10</span></span>
          </div>
          <div className={s.tipRow}>
            <span className={s.tipKey}><i className={s.tipLineKey} />Difficulty</span>
            <span className={s.tipVal}>
              {hp.difficulty}<span> / 5</span>
              {prev && prev.difficulty !== hp.difficulty && (
                <em className={hp.difficulty > prev.difficulty ? s.up : s.down}>
                  {hp.difficulty > prev.difficulty ? "up" : "down"} from {prev.difficulty}
                </em>
              )}
            </span>
          </div>
        </div>
      )}

      <table className="sr-only">
        <caption>Score and difficulty per question</caption>
        <thead><tr><th>Question</th><th>Kind</th><th>Score (of 10)</th><th>Difficulty (of 5)</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.position}>
              <td>Q{p.position}</td><td>{p.kind === "follow_up" ? "Follow-up" : "Primary"}</td>
              <td>{p.score.toFixed(1)}</td><td>{p.difficulty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ small pieces */

function CardHead({ title, desc, icon, children }: {
  title: string; desc?: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className={`card-header ${s.cardHead}`}>
      {icon && <span className="icon-tile primary" aria-hidden>{icon}</span>}
      <div className={s.headTitles}>
        <h3>{title}</h3>
        {desc && <p className="desc">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, icon, value, unit, sub, children }: {
  label: string; icon: React.ReactNode; value: React.ReactNode; unit?: string; sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={s.kpi}>
      <div className={s.kpiLabel}><span className={s.kpiIcon} aria-hidden>{icon}</span>{label}</div>
      <div className={s.kpiValue}>{value}{unit && <span className={s.kpiUnit}>{unit}</span>}</div>
      {children && <div className={s.kpiViz}>{children}</div>}
      {sub && <div className={s.kpiSub}>{sub}</div>}
    </div>
  );
}

/** 0–10 bar with the score-band thresholds (5, 7.5) marked. */
function ScaleBar({ value, label }: { value: number | null; label: string }) {
  return (
    <div className={s.scaleBar} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={10}
      aria-valuenow={value ?? undefined}>
      <i className={s.th} style={{ left: "50%" }} aria-hidden />
      <i className={s.th} style={{ left: "75%" }} aria-hidden />
      {value != null && (
        <div className={s.scaleFill} style={{ width: `${value * 10}%`, background: `var(--${scoreTone(value)}-strong)` }} />
      )}
    </div>
  );
}

function BulletList({ items, icon, empty }: { items: string[]; icon: React.ReactNode; empty: string }) {
  if (!items.length) return <p className={s.empty}>{empty}</p>;
  return <ul className={s.list}>{items.map((t) => <li key={t}>{icon}<span>{t}</span></li>)}</ul>;
}

/* ------------------------------------------------------------------ report */

export default function Report({ session }: { session: SessionDetail }) {
  const report = session.report;

  const meta = useMemo(() => {
    const posById = new Map(session.questions.map((q) => [q.id, q.position]));
    return new Map<number, QMeta>(session.questions.map((q) => [
      q.position,
      { topic: q.topic, parent: q.parent_question_id ? posById.get(q.parent_question_id) ?? null : null },
    ]));
  }, [session.questions]);

  if (!report) return null;
  const { analytics: a, narrative: nr } = report.content;
  const rec = REC[nr.recommendation] ?? REC.consider;
  const completed = fmtDate(session.completed_at ?? report.created_at);
  const generated = fmtDate(report.created_at);
  const questions = [...session.questions].sort((x, y) => x.position - y.position);

  function downloadJson() {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `screening-${session.candidate_name.replace(/\s+/g, "_")}-${session.id.slice(0, 8)}.json`;
    el.click();
    URL.revokeObjectURL(url);
  }

  const answeredSub = [
    a.follow_ups ? plural(a.follow_ups, "follow-up") : "no follow-ups",
    a.skipped ? `${a.skipped} skipped` : null,
  ].filter(Boolean).join(" · ");

  const times = questions
    .map((q) => (q.answer && !q.answer.skipped ? q.answer.time_taken_s : null))
    .filter((t): t is number => t != null);
  const timeRange = times.length > 1
    ? `range ${Math.round(Math.min(...times))}–${Math.round(Math.max(...times))} s`
    : "per answered question";

  const delta = a.resume_anchored_avg != null && a.non_resume_avg != null ? a.resume_anchored_avg - a.non_resume_avg : null;
  const deltaText = delta == null ? null
    : delta >= 0.5 ? "Stronger on resume-claimed topics than on gap probes"
    : delta <= -0.5 ? "Resume claims under-delivered relative to gap probes"
    : "Consistent across claimed and probed topics";
  const resumeTopics = a.topics.filter((t) => t.resume_anchored).length;

  const topics = [...a.topics].sort((x, y) => y.score - x.score);
  const levels = { strong: 0, adequate: 0, weak: 0 };
  a.topics.forEach((t) => { levels[t.level] = (levels[t.level] ?? 0) + 1; });
  const plan = [...a.study_plan].sort((x, y) => x.score - y.score);

  const traj = a.trajectory;
  const diffs = traj.map((p) => p.difficulty);
  const trajCaption = traj.length > 0
    ? `Difficulty opened at ${diffs[0]}, peaked at ${Math.max(...diffs)} and closed at ${diffs[diffs.length - 1]} (of 5).`
    : "";

  const rubric = [
    { label: "Correctness", weight: 50, value: a.rubric_average.correctness },
    { label: "Depth", weight: 30, value: a.rubric_average.depth },
    { label: "Clarity", weight: 20, value: a.rubric_average.clarity },
  ];

  return (
    <div className={`${s.report} fade-in`}>
      <PageHeader
        crumbs={[{ label: "Sessions", href: "/sessions" }, { label: session.candidate_name }]}
        title="Screening report"
        subtitle={`${session.role_title}${completed ? ` · completed ${completed}` : ""}`}
        actions={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
              <Printer size={14} aria-hidden /> Export PDF
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={downloadJson}>
              <Download size={14} aria-hidden /> JSON
            </button>
            <Link href="/" className="btn btn-primary btn-sm"><Plus size={14} aria-hidden /> New screening</Link>
          </>
        }
      />

      {/* ------------------------------------------------ hero verdict */}
      <section className={`card raised ${s.hero} ${TONE_CLASS[rec.tone]}`} aria-label="Hiring recommendation">
        <div className={s.heroGrid}>
          <div className={s.heroMain}>
            <div className={s.eyebrow}>Hiring recommendation</div>
            <div className={s.status}>
              <span className={s.statusIcon} aria-hidden><rec.Icon size={20} strokeWidth={2.25} /></span>
              <span className={s.statusLabel}>{rec.label}</span>
            </div>
            <h2 className={s.headline}>{nr.headline}</h2>
            <p className={s.summary}>{nr.summary}</p>
            {nr.recommendation_reason && (
              <div className={s.rationale}>
                <div className={s.rationaleLabel}><Sparkles size={12} aria-hidden /> Rationale</div>
                <p>{nr.recommendation_reason}</p>
              </div>
            )}
          </div>

          <div className={s.heroScore}>
            <ScoreRing score={a.overall_score} size={152} label="out of 10" thickness={11} />
            <div className={s.heroScoreLabel}>Weighted score</div>
            <div className={s.bands} aria-hidden>
              <div className={s.bandTrack}>
                {(["bad", "warn", "good"] as const).map((t) => (
                  <span key={t} className={`${s.band} ${scoreTone(a.overall_score) === t ? s.bandOn : ""}`}
                    style={{ background: `var(--${t}-strong)` }} />
                ))}
                <span className={s.bandMarker} style={{ left: `${Math.max(0, Math.min(10, a.overall_score)) * 10}%` }} />
              </div>
              <div className={s.bandLabels}><span>Weak</span><span>Adequate</span><span>Strong</span></div>
            </div>
          </div>
        </div>

        <footer className={s.heroFoot} aria-label="Candidate">
          <div className={s.who}>
            <div className="avatar brand" aria-hidden>{initials(session.candidate_name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className={`${s.whoName} truncate`}>{session.candidate_name}</div>
              <div className={`${s.whoRole} truncate`}>{session.role_title}</div>
            </div>
          </div>
          <dl className={s.facts}>
            {completed && <div><dt><Calendar size={12} aria-hidden /> Completed</dt><dd>{completed}</dd></div>}
            <div><dt><MessageSquareText size={12} aria-hidden /> Questions</dt><dd className="nums">{session.questions.length}</dd></div>
            {session.resume_filename && (
              <div className={s.factFile}>
                <dt><FileText size={12} aria-hidden /> Resume</dt>
                <dd className="truncate" title={session.resume_filename}>{session.resume_filename}</dd>
              </div>
            )}
            <div><dt><Hash size={12} aria-hidden /> Report</dt><dd className={s.mono}>{session.id.slice(0, 8)}</dd></div>
          </dl>
        </footer>
      </section>

      {/* ------------------------------------------------ KPI strip */}
      <section className={`card ${s.kpis}`} aria-label="Key metrics">
        <Kpi label="Weighted score" icon={<Gauge size={14} />} value={a.overall_score.toFixed(1)} unit="/ 10"
          sub={`Raw average ${a.raw_average.toFixed(1)} · difficulty-weighted`}>
          <ScaleBar value={a.overall_score} label="Weighted score" />
        </Kpi>
        <Kpi label="Questions answered" icon={<MessageSquareText size={14} />} value={a.answered}
          unit={`/ ${session.questions.length}`} sub={answeredSub}>
          <div className={s.strip} aria-hidden>
            {questions.map((q) => {
              const ans = q.answer;
              const ok = ans && !ans.skipped;
              return <i key={q.id} className={q.kind === "follow_up" ? s.stripFu : undefined}
                style={{ background: ok ? `var(--${scoreTone(ans.score)}-strong)` : "var(--surface-3)" }} />;
            })}
          </div>
        </Kpi>
        <Kpi label="Avg response time" icon={<Timer size={14} />}
          value={a.avg_time_s != null ? fmtSecs(a.avg_time_s).replace(/ s$/, "") : "—"}
          unit={a.avg_time_s != null && a.avg_time_s < 59.5 ? "s" : undefined} sub={timeRange} />
        <Kpi label="Resume-claim score" icon={<Target size={14} />}
          value={a.resume_anchored_avg != null ? a.resume_anchored_avg.toFixed(1) : "—"}
          unit={a.resume_anchored_avg != null ? "/ 10" : undefined}
          sub={<>
            Gap probes {a.non_resume_avg != null ? a.non_resume_avg.toFixed(1) : "—"}
            {delta != null && (
              <span className={`${s.delta} ${delta >= 0.5 ? s.up : delta <= -0.5 ? s.down : ""}`}>{signed(delta)}</span>
            )}
          </>} />
      </section>

      {/* ------------------------------------------------ strengths & gaps */}
      <section className={`card ${s.split}`} aria-label="Strengths and gaps">
        <div className={`${s.splitCol} ${s.toneGood}`}>
          <div className={s.colHead}>
            <span className={`icon-tile good ${s.colIcon}`} aria-hidden><CheckCircle2 size={15} /></span>
            <h3>Strengths</h3><span className={s.count}>{nr.strengths.length}</span>
          </div>
          <BulletList items={nr.strengths} empty="None noted." icon={<span className={s.bulletTone} aria-hidden />} />
        </div>
        <div className={`${s.splitCol} ${s.toneWarn}`}>
          <div className={s.colHead}>
            <span className={`icon-tile warn ${s.colIcon}`} aria-hidden><AlertTriangle size={15} /></span>
            <h3>Gaps</h3><span className={s.count}>{nr.gaps.length}</span>
          </div>
          <BulletList items={nr.gaps} empty="None noted." icon={<span className={s.bulletTone} aria-hidden />} />
        </div>
      </section>

      {/* ------------------------------------------------ resume alignment + rubric */}
      <div className={s.twoUp}>
        <section className={`card ${s.flexCard}`}>
          <CardHead title="Claims vs. evidence" icon={<Scale size={15} />}
            desc={`Resume topics vs. gap probes${a.topics.length ? ` · ${resumeTopics} of ${a.topics.length} topics from resume` : ""}`} />
          <div className={`card-body ${s.grow}`}>
            <div className={s.cmp}>
              {[
                { label: "Claimed on resume", hint: "topics the candidate listed", v: a.resume_anchored_avg },
                { label: "Gap probes", hint: "role topics not on the resume", v: a.non_resume_avg },
              ].map((r) => (
                <div key={r.label} className={s.cmpRow}>
                  <div className={s.cmpHead}>
                    <span className={s.cmpLabel}>{r.label}<span>{r.hint}</span></span>
                    <span className={s.cmpVal}>{r.v != null ? r.v.toFixed(1) : "—"}{r.v != null && <span> / 10</span>}</span>
                  </div>
                  <ScaleBar value={r.v} label={`${r.label} average score`} />
                </div>
              ))}
              <div className={s.axis} aria-hidden><span>0</span><span style={{ left: "50%" }}>5</span><span style={{ left: "75%" }}>7.5</span><span>10</span></div>
            </div>
            {deltaText && delta != null && (
              <div className={`${s.verdictLine} ${delta >= 0.5 ? s.toneGood : delta <= -0.5 ? s.toneWarn : ""}`}>
                <strong className="nums">{signed(delta)}</strong><span>{deltaText}</span>
              </div>
            )}
            {nr.resume_alignment && <p className={s.alignment}>{nr.resume_alignment}</p>}
          </div>
        </section>

        <section className={`card ${s.flexCard}`}>
          <CardHead title="Rubric" icon={<ListChecks size={15} />} desc="Average across answered questions" />
          <div className={`card-body ${s.grow}`}>
            <div className={s.rubric}>
              {rubric.map((r) => (
                <div key={r.label} className={s.rubricRow}>
                  <div className={s.cmpHead}>
                    <span className={s.cmpLabel}>{r.label}<span className={s.weight}>{r.weight}% weight</span></span>
                    <span className={s.cmpVal}>{r.value.toFixed(1)}<span> / 10</span></span>
                  </div>
                  <ScaleBar value={r.value} label={`${r.label} average`} />
                </div>
              ))}
            </div>
            <p className={s.footnote}>
              Score = 0.5 × correctness + 0.3 × depth + 0.2 × clarity, then weighted by question difficulty.
            </p>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ trajectory */}
      {traj.length > 0 && (
        <section className="card">
          <CardHead title="Adaptive trajectory" icon={<Gauge size={15} />} desc="How difficulty responded to each answer">
            <div className={s.legend} aria-hidden>
              <span>
                <span className={s.swatchBars}>
                  <i style={{ background: "var(--good-strong)" }} />
                  <i style={{ background: "var(--warn-strong)" }} />
                  <i style={{ background: "var(--bad-strong)" }} />
                </span>
                Score
              </span>
              <span><span className={s.swatchLine} /> Difficulty</span>
              <span><span className={s.swatchDash} /> Mean</span>
            </div>
          </CardHead>
          <div className={s.chartWrap}>
            <TrajectoryChart points={traj} average={a.raw_average} meta={meta} />
          </div>
          <div className={s.chartFoot}>
            <span>{trajCaption}</span>
            {a.follow_ups > 0 && <span>{plural(a.follow_ups, "follow-up")} triggered by incomplete answers.</span>}
          </div>
        </section>
      )}

      {/* ------------------------------------------------ topics */}
      {topics.length > 0 && (
        <section className="card">
          <CardHead title="Topic breakdown" icon={<Target size={15} />}
            desc={`${plural(a.topics.length, "topic")} · ${levels.strong} strong · ${levels.adequate} adequate · ${levels.weak} weak`} />
          <div role="table" aria-label="Topic breakdown">
            <div className={s.topicHead} role="row">
              <span role="columnheader">Topic</span>
              <span role="columnheader">Source</span>
              <span role="columnheader">Questions</span>
              <span role="columnheader"><span className="sr-only">Score bar</span></span>
              <span role="columnheader" className={s.right}>Score</span>
            </div>
            {topics.map((t) => (
              <div className={s.topicRow} role="row" key={t.topic}>
                <span className={s.topicName} role="cell">
                  <i className={s.levelDot} style={{ background: `var(--${scoreTone(t.score)}-strong)` }} aria-hidden />
                  {t.topic}
                </span>
                <span role="cell">
                  {t.resume_anchored
                    ? <span className="badge primary">From resume</span>
                    : <span className="badge outline">Gap probe</span>}
                </span>
                <span className={s.topicQs} role="cell">{plural(t.questions, "question")}</span>
                <span className={s.topicMeter} role="cell"><ScaleBar value={t.score} label={`${t.topic} score`} /></span>
                <span className={s.score} role="cell">{t.score.toFixed(1)}<span className={s.unit}> / 10</span></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------ study plan */}
      {plan.length > 0 && (
        <section className="card">
          <CardHead title="Study plan" icon={<BookOpen size={15} />}
            desc="Weakest topics first, mapped to the exact textbook pages their questions were grounded in" />
          <div className="table-wrap">
            <table className={`table ${s.planTable}`}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>Topic</th>
                  <th style={{ width: 88 }}>Score</th>
                  <th>Recommended reading</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p, i) => (
                  <tr key={p.topic}>
                    <td><span className={s.rank}>{String(i + 1).padStart(2, "0")}</span></td>
                    <td className={s.planTopic}>{p.topic}</td>
                    <td><ScoreBadge score={p.score} /></td>
                    <td>
                      <div className={s.refs}>
                        {p.references.map((r) => (
                          <div key={`${r.book}-${r.pages}`} className={s.ref}>
                            <BookOpen size={13} aria-hidden />
                            <span className={s.refBook}>{r.book}</span>
                            <span className={s.refPages}>pp. {r.pages}</span>
                          </div>
                        ))}
                        {p.references.length === 0 && <span className={s.empty}>No references</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------ transcript */}
      <section className={`card ${s.breakable}`}>
        <CardHead title="Transcript" icon={<MessageSquareText size={15} />}
          desc={`${plural(session.questions.length, "question")}${a.follow_ups ? ` · ${plural(a.follow_ups, "follow-up")}` : ""}`} />
        <div className={s.timeline}>
          {questions.map((q) => {
            const ans = q.answer;
            const missed = ans?.evaluation.missed_points ?? [];
            const fu = q.kind === "follow_up";
            const parent = meta.get(q.position)?.parent;
            const tone = ans && !ans.skipped ? scoreTone(ans.score) : null;
            return (
              <article key={q.id} className={`${s.qa} ${fu ? s.qaFu : ""}`} aria-label={`Question ${q.position}`}>
                <div className={s.rail} aria-hidden>
                  <span className={`${s.node} ${tone ? TONE_CLASS[tone] : ""}`}>{q.position}</span>
                </div>
                <div className={s.qaBody}>
                  <div className={s.qaHead}>
                    <span className="sr-only">Question {q.position}</span>
                    {fu && <span className={s.fuTag}>Follow-up{parent ? ` to Q${parent}` : ""}</span>}
                    <span className="badge">{QUESTION_TYPE_LABEL[q.question_type] ?? q.question_type}</span>
                    <span className={s.qTopic}>{q.topic}</span>
                    <Difficulty level={q.difficulty} />
                    <span className="spacer" />
                    {ans?.time_taken_s != null && !ans.skipped && (
                      <span className={s.qTime}><Clock size={12} aria-hidden />{fmtSecs(ans.time_taken_s)}</span>
                    )}
                    {ans && !ans.skipped && (
                      <span className={s.qVerdict}>{VERDICT_LABEL[ans.evaluation.verdict] ?? ans.evaluation.verdict}</span>
                    )}
                    {ans && <ScoreBadge score={ans.score} />}
                  </div>

                  <p className={s.qText}>{q.text}</p>

                  <div className={s.answer}>
                    <div className={s.answerLabel}>Candidate answer</div>
                    {!ans ? <span className={s.answerEmpty}>No answer recorded</span>
                      : ans.skipped ? <span className={s.answerEmpty}>Skipped</span>
                      : <div className={s.answerText}>{ans.text}</div>}
                  </div>

                  {ans?.evaluation.feedback && (
                    <div className={`${s.feedback} ${tone ? TONE_CLASS[tone] : ""}`}>
                      <div className={s.answerLabel}>Evaluator feedback</div>
                      <p>{ans.evaluation.feedback}</p>
                    </div>
                  )}

                  <div className={s.qaFoot}>
                    {(q.expected_points.length > 0 || missed.length > 0) && (
                      <details className={s.disclosure}>
                        <summary>
                          <ListChecks size={15} aria-hidden />
                          <span>Expected points</span>
                          <span className="faint text-xs nums" style={{ fontWeight: 400 }}>{q.expected_points.length}</span>
                          {missed.length > 0 && <span className={`badge bad ${s.missedBadge}`}>{missed.length} missed</span>}
                          <ChevronDown size={15} className={s.chev} aria-hidden />
                        </summary>
                        <div className={s.disclosureBody}>
                          {q.expected_points.length > 0 && (
                            <div>
                              <div className={s.subLabel}>Expected</div>
                              <ul className={s.list}>
                                {q.expected_points.map((p) => <li key={p}><span className={s.bullet} aria-hidden /><span>{p}</span></li>)}
                              </ul>
                            </div>
                          )}
                          {missed.length > 0 && (
                            <div>
                              <div className={s.subLabel}>Missed</div>
                              <ul className={s.list}>
                                {missed.map((m) => <li key={m}><XCircle size={15} className={s.iconBad} aria-hidden /><span>{m}</span></li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                    <Sources rationale={q.rationale} queries={q.retrieval_queries} chunks={q.context_chunks} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className={s.docFoot}>
        <span>ScreenIQ screening report</span>
        <span className="nums">Ref {session.id.slice(0, 8)}{generated ? ` · generated ${generated}` : ""}</span>
        <span>Recommendation: {rec.short}</span>
      </footer>
    </div>
  );
}
