/**
 * Shared UI primitives (owned by the lead designer — see frontend/DESIGN.md).
 * Page components compose these; do not fork them per page.
 */
import Link from "next/link";
import { AlertCircle, BookOpen, ChevronDown, ChevronRight, ScanSearch } from "lucide-react";
import type { ContextChunk } from "@/lib/types";

export type Tone = "good" | "warn" | "bad";

export function scoreTone(score: number): Tone {
  return score >= 7.5 ? "good" : score >= 5 ? "warn" : "bad";
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  conceptual: "Conceptual",
  applied: "Applied",
  scenario: "Scenario",
  tradeoff: "Trade-off",
};

export const VERDICT_LABEL: Record<string, string> = {
  strong: "Strong",
  adequate: "Adequate",
  weak: "Needs work",
  no_answer: "Skipped",
  unevaluated: "Not evaluated",
};

/** ScreenIQ logo mark: magnifier ring with an AI spark, on the brand gradient tile (`.brand-mark`). */
export function LogoMark({ size = 30 }: { size?: number }) {
  const glyph = Math.round(size * 0.56);
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }} aria-hidden>
      <svg width={glyph} height={glyph} viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.9" stroke="currentColor" strokeWidth="1.9" />
        <path d="M10.6 10.6 13.6 13.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        <path d="M7 4.6 7.62 6.38 9.4 7 7.62 7.62 7 9.4 6.38 7.62 4.6 7 6.38 6.38Z" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Logo mark + wordmark ("Screen" + gradient "IQ"). */
export function Logo({ size = 30, tag }: { size?: number; tag?: string }) {
  return (
    <>
      <LogoMark size={size} />
      <span>Screen<span className="wordmark-iq">IQ</span></span>
      {tag && <span className="brand-tag">{tag}</span>}
    </>
  );
}

/**
 * Page title block: optional breadcrumb / eyebrow, title (+ optional icon tile), subtitle, right-aligned actions.
 * `eyebrow` and `icon` are optional additions in v3; existing call sites are unchanged.
 */
export function PageHeader({ title, subtitle, crumbs, actions, eyebrow, icon }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  crumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="titles">
        {crumbs && crumbs.length > 0 && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.label} className="row nowrap" style={{ gap: 6 }}>
                {i > 0 && <ChevronRight size={12} aria-hidden />}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="title-row">
          {icon && <span className="title-icon" aria-hidden>{icon}</span>}
          <h1>{title}</h1>
        </div>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="actions no-print">{actions}</div>}
    </header>
  );
}

/** KPI tile. Put several in `.kpi-grid` (separate tiles) or inside one `.card` with your own dividers. */
export function Kpi({ label, value, unit, icon, hint, loading }: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">{icon}{label}</div>
      {loading ? <div className="skeleton" style={{ height: 26, width: 64, margin: "4px 0" }} /> : (
        <div className="kpi-value">{value}{unit && <span className="kpi-unit">{unit}</span>}</div>
      )}
      {hint && <div className="kpi-delta">{hint}</div>}
    </div>
  );
}

/** Empty state: raised icon tile, title, one line of copy, optional action. Wrap in `.card` when standalone. */
export function EmptyState({ icon, title, text, action }: {
  icon: React.ReactNode;
  title: React.ReactNode;
  text?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state fade-in">
      <span className="icon-tile">{icon}</span>
      <h3>{title}</h3>
      {text && <p className="text-sm">{text}</p>}
      {action && <div className="row mt-4" style={{ justifyContent: "center" }}>{action}</div>}
    </div>
  );
}

export function Difficulty({ level, size }: { level: number; size?: "lg" }) {
  return (
    <span className={`difficulty ${size ?? ""}`} title={`Difficulty ${level} of 5`} aria-label={`Difficulty ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= level ? "on" : ""} />)}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  return <span className={`badge ${scoreTone(score)} nums`}>{score.toFixed(1)}</span>;
}

/** Circular score gauge. `size` in px; label renders under the number when given. */
export function ScoreRing({ score, size = 120, label, thickness }: {
  score: number;
  size?: number;
  label?: string;
  thickness?: number;
}) {
  const stroke = thickness ?? Math.max(4, size * 0.07);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, score / 10));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score.toFixed(1)} out of 10`} style={{ flexShrink: 0, overflow: "visible" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(--${scoreTone(score)}-strong)`} strokeWidth={stroke * 2.2}
        strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} opacity={0.12}
        style={{ transition: "stroke-dasharray 0.7s cubic-bezier(.2,.8,.2,1)" }}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(--${scoreTone(score)}-strong)`} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.7s cubic-bezier(.2,.8,.2,1)" }}
      />
      <text x="50%" y="50%" dy={label ? "0" : "0.35em"} textAnchor="middle" fontSize={size * 0.26} fontWeight="600"
        fill="var(--text)" style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>
        {score.toFixed(1)}
      </text>
      {label && (
        <text x="50%" y="50%" dy={size * 0.17} textAnchor="middle" fontSize={Math.max(10, size * 0.09)} fill="var(--muted)">{label}</text>
      )}
    </svg>
  );
}

/** Horizontal labelled meter, e.g. rubric dimensions. */
export function Meter({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "92px 1fr 28px", gap: 12, alignItems: "center" }} className="text-sm">
      <span className="text-2">{label}</span>
      <div className="meter"><div style={{ width: `${(value / max) * 100}%`, background: `var(--${scoreTone((value / max) * 10)}-strong)` }} /></div>
      <span className="nums medium" style={{ textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function Spinner({ light }: { light?: boolean }) {
  return <span className={`spinner ${light ? "light" : ""}`} aria-hidden />;
}

export function ErrorAlert({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="alert error fade-in" role="alert">
      <AlertCircle size={16} />
      <div style={{ flex: 1 }}>{message}</div>
      {action}
    </div>
  );
}

export function PageLoader({ text }: { text: string }) {
  return (
    <div className="fade-in" aria-busy="true">
      <div className="skeleton text" style={{ width: 120 }} />
      <div className="skeleton mt-3" style={{ height: 28, width: 320, maxWidth: "80%" }} />
      <div className="skeleton text mt-3" style={{ width: 420, maxWidth: "90%" }} />
      <div className="row mt-6 muted text-sm" role="status"><Spinner /> {text}</div>
      <div className="kpi-grid mt-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi">
            <div className="skeleton text" style={{ width: "50%" }} />
            <div className="skeleton" style={{ height: 26, width: 64, marginTop: 6 }} />
          </div>
        ))}
      </div>
      <div className="card mt-4">
        <div className="card-header"><div className="skeleton text" style={{ width: 160 }} /></div>
        <div className="card-body stack-sm">
          {[92, 76, 84, 60].map((w) => <div key={w} className="skeleton text" style={{ width: `${w}%` }} />)}
        </div>
      </div>
    </div>
  );
}

/** Traceability panel: how a question was generated (retrieval queries + textbook passages). */
export function Sources({ rationale, queries, chunks, open = false }: {
  rationale?: string;
  queries: string[];
  chunks: ContextChunk[];
  open?: boolean;
}) {
  const books = Array.from(new Set(chunks.map((c) => c.book_title)));
  return (
    <details className="sources" open={open}>
      <summary>
        <ScanSearch size={15} />
        <span>Why this question?</span>
        <span className="faint text-xs" style={{ fontWeight: 400 }}>
          {chunks.length} passages from {books.length === 1 ? books[0] : `${books.length} books`}
        </span>
        <ChevronDown size={15} className="chev" />
      </summary>
      <div className="body">
        {rationale && <p className="text-sm text-2">{rationale}</p>}
        <div className="mt-3">
          <div className="section-label">Retrieval queries</div>
          {queries.map((q) => <span key={q} className="tag">{q}</span>)}
        </div>
        <div className="section-label mt-3">Retrieved passages</div>
        {chunks.map((c) => (
          <div key={`${c.id}-${c.label}`} className={`passage ${c.used ? "cited" : ""}`}>
            <div className="meta">
              <span className="medium text-2">{c.label}</span>
              <span className="row nowrap" style={{ gap: 4 }}><BookOpen size={11} /> {c.book_title}, p. {c.page_start}{c.page_end !== c.page_start ? `–${c.page_end}` : ""}</span>
              <span className="nums">sim {c.similarity.toFixed(2)}</span>
              <span>{c.matched_by.join(" + ")}</span>
              {c.used && <span className="badge primary" style={{ height: 18, fontSize: 11 }}>cited</span>}
            </div>
            {c.text.length > 480 ? `${c.text.slice(0, 480)}…` : c.text}
          </div>
        ))}
      </div>
    </details>
  );
}
