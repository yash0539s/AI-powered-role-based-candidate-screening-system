"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronRight, Clock, CornerDownRight, Flag, Layers, Minus,
  RotateCcw, SkipForward, Sparkles, TrendingDown, TrendingUp, XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AnswerResult, CandidateQuestion, SessionDetail } from "@/lib/types";
import {
  Difficulty, ErrorAlert, formatDuration, Meter, PageHeader, QUESTION_TYPE_LABEL, ScoreRing, scoreTone, Sources, Spinner,
  VERDICT_LABEL,
} from "./common";
import s from "./Interview.module.css";

type Phase = "loading" | "answering" | "submitting" | "feedback" | "finishing" | "error";
type Answered = { topic: string; score: number; kind: string };

const LOADING_STEPS = ["Searching the role's textbooks", "Ranking & de-duplicating passages", "Writing a question for this candidate"];
const FINISHING_STEPS = ["Per-topic analytics", "Resume alignment", "Grounded study plan"];

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable */ }
  },
};
const draftKey = (qid: string) => `draft:${qid}`;

export default function Interview({ session, onCompleted }: {
  session: SessionDetail;
  onCompleted: (s: SessionDetail) => void;
}) {
  const [question, setQuestion] = useState<CandidateQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [practice, setPractice] = useState(true);
  const [difficulty, setDifficulty] = useState(session.current_difficulty);
  const [answered, setAnswered] = useState<Answered[]>(
    session.questions.filter((q) => q.answer).map((q) => ({ topic: q.topic, score: q.answer!.score, kind: q.kind })),
  );
  const [elapsed, setElapsed] = useState(0);
  const [loadStep, setLoadStep] = useState(0);
  const startedAt = useRef(Date.now());
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setPractice(store.get("practiceMode") !== "false"); }, []);

  // answer timer
  useEffect(() => {
    if (phase !== "answering") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // staged loading copy
  useEffect(() => {
    if (phase !== "loading") return;
    setLoadStep(0);
    const t = setInterval(() => setLoadStep((n) => Math.min(n + 1, LOADING_STEPS.length - 1)), 1200);
    return () => clearInterval(t);
  }, [phase]);

  const finish = useCallback(async () => {
    setPhase("finishing");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      onCompleted(await api.complete(session.id));
    } catch (e) {
      setError((e as ApiError).message);
      setPhase("error");
    }
  }, [session.id, onCompleted]);

  const loadNext = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const q = await api.nextQuestion(session.id);
      setQuestion(q);
      setAnswer(store.get(draftKey(q.id)) ?? "");
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase("answering");
      setTimeout(() => textRef.current?.focus({ preventScroll: true }), 50);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) return finish(); // question budget exhausted -> report
      setError(err.message);
      setPhase("error");
    }
  }, [session.id, finish]);

  useEffect(() => { loadNext(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(skipped = false) {
    if (!question || phase !== "answering") return;
    setPhase("submitting");
    setError(null);
    try {
      const r = await api.answer(session.id, question.id, {
        answer: skipped ? "" : answer,
        skipped,
        time_taken_s: Math.round((Date.now() - startedAt.current) / 1000),
      });
      store.set(draftKey(question.id), null);
      setResult(r);
      setAnswered((a) => [...a, { topic: question.topic, score: r.score, kind: question.kind }]);
      setDifficulty(r.difficulty_after);
      if (practice) setPhase("feedback");
      else if (r.next_action === "complete") await finish();
      else await loadNext();
    } catch (e) {
      setError((e as ApiError).message);
      setPhase("answering");
    }
  }

  const total = session.num_questions;
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const busy = phase === "submitting" || phase === "finishing";
  const canFinish = answered.length > 0 && !busy && phase !== "feedback";
  const avg = answered.length ? answered.reduce((sum, a) => sum + a.score, 0) / answered.length : null;
  const pct = Math.round((answered.length / total) * 100);
  const current = question?.position ?? Math.min(answered.length + 1, total);
  const showQuestion = question && ["answering", "submitting", "feedback"].includes(phase);
  const inFlight = phase === "loading" || phase === "answering" || phase === "submitting";
  const canSubmit = answer.trim().length >= 3;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Sessions", href: "/sessions" }, { label: session.candidate_name }]}
        title="Interview"
        subtitle={session.role_title}
        actions={
          <button className="btn btn-secondary btn-sm" disabled={!canFinish} onClick={finish}>
            <Flag size={14} /> End interview
          </button>
        }
      />

      {/* ---------------------------------------------------------------- progress strip */}
      <div className={s.progressStrip} aria-label="Interview progress">
        <div className={s.progressLead}>
          <span className={s.progressEyebrow}>Progress</span>
          <span className={`${s.progressCount} nums`}>
            Question <b>{current}</b><span className={s.of}> of {total}</span>
          </span>
        </div>
        <div className={s.segments} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered.length}
          aria-valuetext={`${answered.length} of ${total} answered (${pct}%)`}>
          {Array.from({ length: total }, (_, i) => {
            const a = answered[i];
            const isCur = !a && i === answered.length && inFlight;
            return (
              <span key={i}
                className={`${s.seg} ${a ? s[`seg_${scoreTone(a.score)}`] : isCur ? s.segCurrent : ""}`}
                title={a ? `Q${i + 1} · ${a.topic} · ${a.score.toFixed(1)} / 10` : `Q${i + 1}`} />
            );
          })}
        </div>
        <div className={s.progressStats}>
          <span className={s.stat}>
            <span className={s.statK}>Average</span>
            <b className={`nums ${avg !== null ? s[`tone_${scoreTone(avg)}`] : ""}`}>{avg !== null ? avg.toFixed(1) : "—"}</b>
            <span className={s.statUnit}>/ 10</span>
          </span>
          <span className={s.sep} aria-hidden />
          <span className={s.stat}><span className={s.statK}>Difficulty</span> <Difficulty level={difficulty} /></span>
        </div>
      </div>

      <div className={s.layout}>
        <div className={s.main}>
          {error && (
            <ErrorAlert message={error} action={
              phase === "error" && (
                <button className="btn btn-secondary btn-sm" onClick={answered.length >= total ? finish : loadNext}>
                  <RotateCcw size={14} /> Retry
                </button>
              )
            } />
          )}

          {phase === "loading" && <LoadingCard step={loadStep} position={Math.min(answered.length + 1, total)} total={total} />}

          {phase === "finishing" && <FinishingCard answered={answered.length} avg={avg} />}

          {showQuestion && question && (
            <section className={`card ${s.qcard} fade-in`} key={question.id} aria-labelledby={`q-${question.id}`}>
              <div className={s.qHead}>
                <span className={`${s.qNum} nums`}>
                  <span className={s.qNumLabel}>Q</span>{question.position}<span className={s.qNumTotal}>/{question.total_questions}</span>
                </span>
                <span className={s.chip}>{QUESTION_TYPE_LABEL[question.question_type] ?? question.question_type}</span>
                {question.kind === "follow_up" && (
                  <span className={`${s.chip} ${s.chipFollow}`}><CornerDownRight size={12} aria-hidden /> Follow-up</span>
                )}
                <span className={s.grow} />
                <span className={s.headDifficulty}><span className={s.headDiffLabel}>Difficulty</span> <Difficulty level={question.difficulty} /></span>
              </div>

              <div className={s.qBody}>
                <div className={s.topic}><Layers size={13} aria-hidden /> {question.topic}</div>
                <h2 className={s.questionText} id={`q-${question.id}`}>{question.text}</h2>

                {phase !== "feedback" && (
                  <div className={`${s.composer} ${phase === "submitting" ? s.composerBusy : ""}`}>
                    <textarea
                      ref={textRef}
                      className={s.textarea}
                      value={answer}
                      placeholder="Explain your reasoning - mechanisms, trade-offs, and an example where relevant."
                      disabled={phase === "submitting"}
                      onChange={(e) => { setAnswer(e.target.value); store.set(draftKey(question.id), e.target.value); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && answer.trim().length >= 3) { e.preventDefault(); submit(); }
                      }}
                      aria-label="Your answer"
                      aria-describedby={`a-meta-${question.id}`}
                    />
                    <div className={s.composerBar} id={`a-meta-${question.id}`}>
                      <span className={`${s.metaPill} nums`} title="Time on this question">
                        <Clock size={12} aria-hidden /> {formatDuration(elapsed)}
                      </span>
                      <span className={`${s.metaPill} nums`} aria-live="off">
                        {words} {words === 1 ? "word" : "words"}
                      </span>
                      <span className={s.saved}>
                        {answer ? <><Check size={12} aria-hidden /> Draft saved</> : "Drafts save automatically"}
                      </span>
                      <span className={s.grow} />
                      <span className={s.kbdHint}><span className="kbd">Ctrl</span><span className="kbd">↵</span> to submit</span>
                    </div>
                  </div>
                )}

                {phase !== "feedback" && (
                  <div className={s.actionsRow}>
                    <p className={s.actionsNote}>
                      {phase === "submitting"
                        ? "Grading against the retrieved passages…"
                        : practice ? "You'll see feedback after submitting." : "Screening mode: feedback is held for the report."}
                    </p>
                    <div className={s.actions}>
                      <button className="btn btn-ghost" disabled={phase === "submitting"} onClick={() => submit(true)}>
                        <SkipForward size={14} /> Skip
                      </button>
                      <button className={`btn btn-primary ${s.submitBtn}`} disabled={phase === "submitting" || !canSubmit} onClick={() => submit()}>
                        {phase === "submitting" ? <><Spinner light /> Evaluating…</> : <>Submit answer <ArrowRight size={15} /></>}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {phase === "feedback" && result && <Evaluation result={result} answer={answer} />}

              <div className={s.sourcesWrap}>
                <Sources rationale={question.rationale} queries={question.retrieval_queries} chunks={question.context_chunks} />
              </div>

              {phase === "feedback" && result && (
                <div className={s.nextBar}>
                  <div className={s.nextText}>
                    <span className={s.nextTitle}>
                      {result.questions_remaining > 0
                        ? `${result.questions_remaining} question${result.questions_remaining > 1 ? "s" : ""} remaining`
                        : "Last question answered"}
                    </span>
                    {result.will_follow_up && <span className={s.nextSub}>A follow-up will probe what was missed</span>}
                  </div>
                  <button
                    className={`btn btn-primary ${s.nextBtn}`}
                    onClick={result.next_action === "complete" ? finish : loadNext}
                    ref={(el) => el?.focus({ preventScroll: true })}
                  >
                    {result.next_action === "complete" ? "View report" : result.will_follow_up ? "Continue to follow-up" : "Next question"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className={s.rail} aria-label="Interview overview">
          <Rail
            session={session} answered={answered} total={total} avg={avg}
            currentTopic={question?.topic} practice={practice}
            onPractice={(v) => { setPractice(v); store.set("practiceMode", String(v)); }}
          />
        </aside>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ loading */

function LoadingCard({ step, position, total }: { step: number; position: number; total: number }) {
  return (
    <section className={`card ${s.qcard} fade-in`} aria-busy="true" aria-live="polite">
      <div className={s.qHead}>
        <span className={`${s.qNum} nums`}><span className={s.qNumLabel}>Q</span>{position}<span className={s.qNumTotal}>/{total}</span></span>
        <div className="skeleton" style={{ height: 22, width: 76, borderRadius: 999 }} />
        <span className={s.grow} />
        <div className="skeleton" style={{ height: 14, width: 84 }} />
      </div>
      <div className={s.qBody}>
        <div className="skeleton" style={{ height: 13, width: 160 }} />
        <div className="skeleton mt-4" style={{ height: 22, width: "94%" }} />
        <div className="skeleton mt-2" style={{ height: 22, width: "71%" }} />
        <div className={s.composerSkeleton}>
          <div className="skeleton" style={{ height: 12, width: "58%" }} />
          <div className="skeleton mt-2" style={{ height: 12, width: "42%" }} />
          <div className={s.composerSkeletonBar}>
            <div className="skeleton" style={{ height: 20, width: 52, borderRadius: 999 }} />
            <div className="skeleton" style={{ height: 20, width: 64, borderRadius: 999 }} />
          </div>
        </div>
      </div>
      <div className={s.genPanel}>
        <div className={s.genHead}>
          <span className={s.genIcon}><Sparkles size={14} aria-hidden /></span>
          <span className={s.genTitle}>Preparing your next question</span>
          <span className={`${s.genCount} nums`}>{Math.min(step + 1, LOADING_STEPS.length)} / {LOADING_STEPS.length}</span>
        </div>
        <div className={s.genTrack} aria-hidden><div style={{ width: `${((step + 1) / LOADING_STEPS.length) * 100}%` }} /></div>
        <ol className={s.checklist}>
          {LOADING_STEPS.map((label, i) => {
            const state = i < step ? "done" : i === step ? "active" : "pending";
            return (
              <li key={label} className={state === "done" ? s.stepDone : state === "active" ? s.stepActive : undefined}
                aria-current={state === "active" ? "step" : undefined}>
                <span className={s.mark}>
                  {state === "done" ? <Check size={12} strokeWidth={3} aria-label="Done" />
                    : state === "active" ? <Spinner /> : <span className={s.pendingDot} />}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function FinishingCard({ answered, avg }: { answered: number; avg: number | null }) {
  return (
    <section className={`card ${s.qcard} fade-in`} aria-busy="true" aria-live="polite">
      <div className={s.finishHero}>
        <span className={s.finishOrb}><Spinner /></span>
        <div className={s.finishText}>
          <h2 className={s.finishTitle}>Generating report…</h2>
          <p className={s.finishSub}>
            Computing per-topic analytics, resume alignment and a grounded study plan from{" "}
            <span className="nums">{answered}</span> answer{answered === 1 ? "" : "s"}
            {avg !== null && <> · running average <b className="nums">{avg.toFixed(1)} / 10</b></>}.
          </p>
        </div>
      </div>
      <ul className={s.finishSteps}>
        {FINISHING_STEPS.map((label, i) => (
          <li key={label} style={{ animationDelay: `${i * 0.6}s` }}><span className={s.finishDot} aria-hidden /> {label}</li>
        ))}
      </ul>
      <div className={s.qBody}>
        <div className="skeleton" style={{ height: 16, width: "36%" }} />
        <div className={`${s.finishGrid} mt-3`}>
          {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 76, borderRadius: "var(--radius)" }} />)}
        </div>
        <div className="skeleton mt-3" style={{ height: 120, borderRadius: "var(--radius)" }} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ rail */

function Rail({ session, answered, total, avg, currentTopic, practice, onPractice }: {
  session: SessionDetail;
  answered: Answered[];
  total: number;
  avg: number | null;
  currentTopic?: string;
  practice: boolean;
  onPractice: (v: boolean) => void;
}) {
  const byTopic = (t: string) => answered.filter((a) => a.topic === t);
  const followUps = answered.filter((a) => a.kind === "follow_up").length;

  return (
    <>
      <section className={`card ${s.railCard}`}>
        <div className={s.railHead}><h3>Progress</h3><span className={`${s.railDesc} nums`}>{answered.length} / {total}</span></div>
        <div className={s.railBody}>
          <div className={s.who}>
            {avg !== null
              ? <ScoreRing score={avg} size={72} label="avg" />
              : <div className={s.ringPlaceholder} aria-label="No score yet"><Minus size={16} aria-hidden /></div>}
            <div className={s.whoText}>
              <div className={s.whoName}>{session.candidate_name}</div>
              <div className={s.whoRole}>{session.role_title}</div>
            </div>
          </div>
          <dl className={s.statGrid}>
            <div className={s.statTile}><dt>Answered</dt><dd className="nums">{answered.length}<span>/{total}</span></dd></div>
            <div className={s.statTile}><dt>Running avg</dt><dd className="nums">{avg !== null ? avg.toFixed(1) : "—"}<span>/10</span></dd></div>
            <div className={s.statTile}><dt>Follow-ups</dt><dd className="nums">{followUps}</dd></div>
          </dl>
        </div>
      </section>

      <section className={`card ${s.railCard}`}>
        <div className={s.railHead}><h3>Topics</h3><span className={`${s.railDesc} nums`}>{session.plan.topics.length} planned</span></div>
        <div className={s.railBody}>
          <ol className={s.timeline}>
            {session.plan.topics.map((t, i) => {
              const done = byTopic(t.topic);
              const isCurrent = t.topic === currentTopic;
              const state = isCurrent ? "current" : done.length ? "done" : "upcoming";
              const last = done[done.length - 1];
              const nodeCls = state === "current" ? s.nodeCurrent : state === "done" ? s.nodeDone : s.nodeUpcoming;
              return (
                <li key={t.topic} className={`${s.tlItem} ${s[state]}`} aria-current={isCurrent ? "step" : undefined}>
                  <span className={`${s.node} ${nodeCls}`}>{state === "done" ? <Check size={11} strokeWidth={3} aria-hidden /> : i + 1}</span>
                  <div className={s.tlBody}>
                    <div className={s.tlTitle}>{t.topic}</div>
                    <div className={s.tlSub}>
                      {isCurrent ? "In progress" : last ? `${done.length > 1 ? "With follow-up" : "Answered"}` : t.resume_anchor ? "From resume" : "Gap probe"}
                    </div>
                  </div>
                  {last && !isCurrent && <span className={`badge ${scoreTone(last.score)} nums`}>{last.score.toFixed(1)}</span>}
                </li>
              );
            })}
          </ol>
          <p className={s.note}>Follow-ups use the question budget, so later topics may be skipped.</p>
        </div>
      </section>

      <section className={`card ${s.railCard} ${s.modeCard}`}>
        <div className={s.railBody}>
          <div className={s.modeRow}>
            <div className={s.modeText}>
              <div className={s.modeTitle}>{practice ? "Practice mode" : "Screening mode"}</div>
              <p className={s.modeHint}>{practice ? "Shows grading feedback after each answer." : "Screening mode: feedback only in the final report."}</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={practice} onChange={(e) => onPractice(e.target.checked)} />
              <span className="sr-only">Practice mode</span>
            </label>
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ evaluation */

function Evaluation({ result, answer }: { result: AnswerResult; answer: string }) {
  const ev = result.evaluation;
  const up = result.difficulty_after > result.difficulty_before;
  const down = result.difficulty_after < result.difficulty_before;
  const tone = scoreTone(result.score);
  return (
    <div className={`${s.evalPanel} fade-in`} aria-live="polite">
      <div className={`${s.evalTop} ${s[`evalTop_${tone}`]}`}>
        <ScoreRing score={result.score} size={92} label="/ 10" />
        <div className={s.evalSummary}>
          <div className={s.evalEyebrow}>Evaluation</div>
          <div className={s.evalVerdictRow}>
            <span className={`${s.verdict} ${s[`tone_${tone}`]}`}>{VERDICT_LABEL[ev.verdict] ?? ev.verdict}</span>
            <span className={`${s.diffChange} ${up ? s.diffUp : down ? s.diffDown : ""}`}>
              {up ? <><TrendingUp size={13} aria-hidden /> Harder next</> : down ? <><TrendingDown size={13} aria-hidden /> Easier next</> : <><Minus size={13} aria-hidden /> Same level</>}
              <span className={s.diffBars}><Difficulty level={result.difficulty_after} /></span>
            </span>
          </div>
          {ev.feedback && <p className={s.feedback}>{ev.feedback}</p>}
        </div>
      </div>

      <div className={s.rubric}>
        <div className={s.blockTitle}>Rubric</div>
        <Meter label="Correctness" value={ev.rubric.correctness} />
        <Meter label="Depth" value={ev.rubric.depth} />
        <Meter label="Clarity" value={ev.rubric.clarity} />
      </div>

      {(ev.covered_points.length > 0 || ev.missed_points.length > 0) && (
        <div className={s.points}>
          {ev.covered_points.length > 0 && (
            <div className={`${s.pointsCol} ${s.pointsGood}`}>
              <div className={s.pointsTitle}>Covered <span className="nums">{ev.covered_points.length}</span></div>
              <ul className={s.pointList}>
                {ev.covered_points.map((p) => <li key={p}><CheckCircle2 size={15} className={s.iconGood} aria-hidden />{p}</li>)}
              </ul>
            </div>
          )}
          {ev.missed_points.length > 0 && (
            <div className={`${s.pointsCol} ${s.pointsBad}`}>
              <div className={s.pointsTitle}>Missed <span className="nums">{ev.missed_points.length}</span></div>
              <ul className={s.pointList}>
                {ev.missed_points.map((p) => <li key={p}><XCircle size={15} className={s.iconBad} aria-hidden />{p}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {ev.misconceptions.length > 0 && (
        <div className={`alert warn ${s.misconceptions}`}>
          <AlertTriangle size={16} aria-hidden />
          <div>
            <b>Misconceptions</b>
            <ul>{ev.misconceptions.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        </div>
      )}

      {answer.trim() && (
        <details className={s.yourAnswer}>
          <summary><ChevronRight size={14} className={s.chev} aria-hidden /> Your answer <span className={`${s.summaryMeta} nums`}>{answer.trim().split(/\s+/).length} words</span></summary>
          <div className={s.answerBox}>{answer}</div>
        </details>
      )}
    </div>
  );
}
