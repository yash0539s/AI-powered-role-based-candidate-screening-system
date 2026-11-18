import {
  ArrowRight, BrainCircuit, Briefcase, Cpu, Crosshair, FileCheck2, FileText, FolderGit2, GraduationCap,
  Info, Layers, Sparkles, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SessionDetail } from "@/lib/types";
import { Difficulty, initials, PageHeader, QUESTION_TYPE_LABEL, Spinner } from "./common";
import s from "./ProfilePlan.module.css";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function TagGroup({ icon: Icon, label, items, accent }: {
  icon: LucideIcon;
  label: string;
  items: string[] | undefined;
  accent?: boolean;
}) {
  const n = items?.length ?? 0;
  return (
    <div className={s.group}>
      <div className={s.groupHead}>
        <span className={s.groupIcon} aria-hidden><Icon size={14} /></span>
        <span className={s.groupLabel}>{label}</span>
        <span className={`${s.groupCount} nums`} aria-label={`${n} detected`}>{n}</span>
      </div>
      {n > 0 ? (
        <ul className={s.tags} aria-label={label}>
          {items!.map((x) => <li key={x} className={`${s.tag} ${accent ? s.tagAccent : ""}`}>{x}</li>)}
        </ul>
      ) : (
        <span className={s.none}>None detected</span>
      )}
    </div>
  );
}

function StartButton({ onStart, starting, block }: { onStart: () => void; starting: boolean; block?: boolean }) {
  return (
    <button
      type="button"
      className={`btn btn-primary btn-lg ${s.cta} ${block ? s.ctaBlock : ""}`}
      onClick={onStart}
      disabled={starting}
      aria-busy={starting}
    >
      {starting ? <><Spinner light /> Starting…</> : <>Start interview <ArrowRight size={16} aria-hidden /></>}
    </button>
  );
}

export default function ProfilePlan({ session, onStart, starting }: {
  session: SessionDetail;
  onStart: () => void;
  starting: boolean;
}) {
  const p = session.profile;
  const topics = session.plan.topics;
  const anchored = topics.filter((t) => t.resume_anchor).length;
  const probes = topics.length - anchored;
  const start = session.plan.initial_difficulty;
  const profileFallback = (p.extraction_source ?? "").includes("fallback");
  const planFallback = session.plan.source !== "llm";
  const anchoredPct = topics.length ? Math.round((anchored / topics.length) * 100) : 0;

  return (
    <div className="fade-in">
      <PageHeader
        crumbs={[{ label: "Sessions", href: "/sessions" }, { label: session.candidate_name }]}
        title="Review interview plan"
        subtitle={`${session.role_title} · ${plural(session.num_questions, "question")} · starting difficulty ${start}/5`}
      />

      {/* ---------- Candidate hero ---------- */}
      <section className={s.hero} aria-labelledby="candidate-name">
        <div className={s.heroMain}>
          <div className={s.identity}>
            <div className={s.avatar} aria-hidden>{initials(session.candidate_name)}</div>
            <div className={s.identityText}>
              <div className={s.eyebrow}>
                <Sparkles size={12} aria-hidden /> Profile ready for {session.role_title}
              </div>
              <h2 id="candidate-name" className={s.name}>{session.candidate_name}</h2>
              <div className={s.metaRow}>
                <span className={`badge primary ${s.level}`}>{p.experience_level}</span>
                <span className={s.metaItem}>
                  <Briefcase size={13} aria-hidden />
                  <span className="nums">{p.years_experience}</span> {p.years_experience === 1 ? "year" : "years"} experience
                </span>
                {session.resume_filename && (
                  <span className={`${s.metaItem} ${s.file}`} title={session.resume_filename}>
                    <FileText size={13} aria-hidden />
                    <span className={s.fileName}>{session.resume_filename}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className={s.heroCta}>
            <StartButton onStart={onStart} starting={starting} />
            <span className={s.ctaHint}>
              <span className="nums">{plural(session.num_questions, "question")}</span> · adapts after each answer
            </span>
          </div>
        </div>

        {p.summary && <p className={s.blurb}>{p.summary}</p>}

        <dl className={s.stats}>
          <div className={s.stat}>
            <dt>Plan topics</dt>
            <dd className="nums">{topics.length}</dd>
          </div>
          <div className={s.stat}>
            <dt><span className={`${s.key} ${s.keyAnchor}`} aria-hidden /> From resume</dt>
            <dd className="nums">{anchored}</dd>
          </div>
          <div className={s.stat}>
            <dt><span className={`${s.key} ${s.keyProbe}`} aria-hidden /> Gap probes</dt>
            <dd className="nums">{probes}</dd>
          </div>
          <div className={s.stat}>
            <dt>Start level</dt>
            <dd className={s.statLevel}>
              <span className="nums">{start}<span className={s.statUnit}> / 5</span></span>
              <Difficulty level={start} />
            </dd>
          </div>
        </dl>

        {topics.length > 0 && (
          <div className={s.mix}>
            <div
              className={s.mixBar}
              role="img"
              aria-label={`${anchoredPct}% of topics verify resume claims, ${100 - anchoredPct}% probe gaps`}
            >
              {anchoredPct > 0 && <span className={s.mixAnchor} style={{ width: `${anchoredPct}%` }} />}
              {anchoredPct < 100 && <span className={s.mixProbe} style={{ width: `${100 - anchoredPct}%` }} />}
            </div>
            <span className={`${s.mixLabel} nums`}>{anchoredPct}% resume-verified</span>
          </div>
        )}
      </section>

      <div className={s.layout}>
        {/* ---------- Interview plan timeline ---------- */}
        <section className={`card ${s.planCard}`} aria-labelledby="plan-title">
          <div className="card-header">
            <div className={s.headerText}>
              <h3 id="plan-title">Interview plan</h3>
              <p className="desc">Ordered from familiar to advanced. Difficulty adapts after every answer.</p>
            </div>
            <div className={s.legend} aria-hidden>
              <span><span className={`${s.key} ${s.keyAnchor}`} /> Resume</span>
              <span><span className={`${s.key} ${s.keyProbe}`} /> Probe</span>
            </div>
          </div>

          <ol className={s.timeline}>
            {topics.map((t, i) => {
              const isAnchor = Boolean(t.resume_anchor);
              return (
                <li key={`${t.topic}-${i}`} className={`${s.step} ${isAnchor ? s.stepAnchor : s.stepProbe}`}>
                  <span className={s.node} aria-hidden>{i + 1}</span>
                  <div className={s.stepCard}>
                    <div className={s.stepTop}>
                      <div className={s.stepTitle}>{t.topic}</div>
                      <div className={s.diff}>
                        <Difficulty level={t.base_difficulty} />
                        <span className="nums">{t.base_difficulty}/5</span>
                      </div>
                    </div>
                    <div className={s.stepMeta}>
                      {isAnchor ? (
                        <span className={`${s.kind} ${s.kindAnchor}`}>
                          <FileCheck2 size={12} aria-hidden /> Verifies resume claim
                        </span>
                      ) : (
                        <span className={`${s.kind} ${s.kindProbe}`}>
                          <Crosshair size={12} aria-hidden /> Gap probe
                        </span>
                      )}
                      <span className="badge">{QUESTION_TYPE_LABEL[t.question_type] ?? t.question_type}</span>
                    </div>
                    {isAnchor && (
                      <div className={s.claim} title={t.resume_anchor ?? undefined}>
                        <span className={s.claimLabel}>Resume</span>
                        <span className={s.claimText}>{t.resume_anchor}</span>
                      </div>
                    )}
                    {t.why && <p className={s.why}>{t.why}</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className={s.planFooter}>
            <div className={s.note}>
              <Info size={15} aria-hidden />
              <p>
                The plan is a starting point. Partially correct answers trigger a follow-up on the same topic, and each
                follow-up counts toward the {plural(session.num_questions, "question")} budget.
                {planFallback && <span className={s.fallback}> Generated with the rule-based fallback planner.</span>}
              </p>
            </div>
            <StartButton onStart={onStart} starting={starting} block />
          </div>
        </section>

        {/* ---------- Profile side panel ---------- */}
        <aside className={s.aside} aria-label="Candidate profile">
          <section className="card" aria-labelledby="profile-title">
            <div className="card-header">
              <div className={s.headerText}>
                <h3 id="profile-title">Extracted profile</h3>
                <p className="desc">Parsed from the resume</p>
              </div>
            </div>
            <div className={s.groups}>
              <TagGroup icon={BrainCircuit} label="ML concepts" items={p.ml_concepts} accent />
              <TagGroup icon={Cpu} label="Technologies" items={p.technologies} />
              <TagGroup icon={Wrench} label="Skills" items={p.skills} />
              <TagGroup icon={Layers} label="Domains" items={p.domains} />
              <div className={s.group}>
                <div className={s.groupHead}>
                  <span className={s.groupIcon} aria-hidden><GraduationCap size={14} /></span>
                  <span className={s.groupLabel}>Education</span>
                </div>
                {p.education
                  ? <p className={s.education}>{p.education}</p>
                  : <span className={s.none}>None detected</span>}
              </div>
            </div>
            {profileFallback && (
              <div className={s.sourceNote}>
                <Info size={13} aria-hidden /> Extracted with keyword fallback ({p.extraction_source})
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="projects-title">
            <div className="card-header">
              <h3 id="projects-title">Projects</h3>
              <span className={`${s.groupCount} nums`}>{p.projects?.length ?? 0}</span>
            </div>
            {p.projects?.length ? (
              <ul className={s.projects}>
                {p.projects.map((pr, i) => (
                  <li key={`${pr.name}-${i}`} className={s.project}>
                    <span className={s.projectIcon} aria-hidden><FolderGit2 size={14} /></span>
                    <div className={s.projectBody}>
                      <div className={s.projectName}>{pr.name}</div>
                      {pr.summary && <p className={s.projectSummary}>{pr.summary}</p>}
                      {pr.technologies?.length > 0 && (
                        <ul className={s.projectTech} aria-label={`${pr.name} technologies`}>
                          {pr.technologies.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="card-body"><span className={s.none}>None detected</span></div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
