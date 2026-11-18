"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, FileQuestion, RotateCw } from "lucide-react";
import Stepper from "@/components/Stepper";
import ProfilePlan from "@/components/ProfilePlan";
import Interview from "@/components/Interview";
import Report from "@/components/Report";
import { Spinner } from "@/components/common";
import { api, ApiError } from "@/lib/api";
import type { SessionDetail } from "@/lib/types";
import styles from "./session.module.css";

/** Skeleton shaped like a session stage: stepper, candidate header, main + side panels. */
function SessionLoader() {
  return (
    <div className="fade-in" aria-busy="true">
      <div className={styles.stepperSkel} aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.stepSkel}>
            {i > 0 && <span className={styles.sep} />}
            <div className="skeleton" style={{ width: 20, height: 20, borderRadius: "50%" }} />
            <div className={`skeleton ${styles.stepLabel}`} style={{ width: 72, height: 10 }} />
          </div>
        ))}
      </div>

      <div className={styles.status} role="status">
        <Spinner /> Loading session…
      </div>

      <div className={styles.headerSkel} aria-hidden>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 22, width: "min(280px, 70%)" }} />
          <div className="skeleton mt-2" style={{ height: 12, width: "min(180px, 50%)" }} />
        </div>
      </div>

      <div className={styles.layout} aria-hidden>
        <div className={`card ${styles.panel}`}>
          <div className="skeleton" style={{ height: 12, width: 110 }} />
          <div className={`mt-4 ${styles.lines}`}>
            {[96, 88, 92, 64].map((w, i) => <div key={i} className="skeleton" style={{ height: 12, width: `${w}%` }} />)}
          </div>
          <div className="skeleton mt-6" style={{ height: 120, borderRadius: 10 }} />
        </div>
        <div className={`card ${styles.panel}`}>
          <div className="skeleton" style={{ height: 12, width: 90 }} />
          <div className={`mt-4 ${styles.lines}`}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="row nowrap" style={{ gap: 10 }}>
                <div className="skeleton" style={{ height: 10, flex: 1 }} />
                <div className="skeleton" style={{ height: 10, width: 28 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Stage is derived from server state (status + questions), so a reload or a
 * shared link always resumes at the right place in the interview lifecycle.
 */
export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [started, setStarted] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.getSession(id).then(setSession).catch((e: ApiError) => setError({ status: e.status, message: e.message }));
  }, [id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (session) document.title = `${session.candidate_name} · ${session.status === "completed" ? "Report" : "Interview"} · ScreenIQ`;
  }, [session]);

  if (error) {
    const notFound = error.status === 404;
    return (
      <div className={`${styles.errorWrap} fade-in`}>
        <div className={`card ${styles.errorCard}`} role="alert">
          <div className={`${styles.errorBody} ${notFound ? "" : styles.isError}`}>
            <div className={styles.errorIcon} aria-hidden>
              {notFound ? <FileQuestion size={22} /> : <AlertTriangle size={22} />}
            </div>
            <span className={styles.code}>{notFound ? "Error 404" : error.status ? `Error ${error.status}` : "Connection error"}</span>
            <h1 className={styles.title}>{notFound ? "Session not found" : "Couldn’t load session"}</h1>
            <p className={styles.message}>
              {notFound ? "This screening session does not exist or was deleted." : error.message}
            </p>
          </div>
          <div className={styles.actions}>
            <Link href="/sessions" className={`btn ${notFound ? "btn-primary" : "btn-secondary"}`}>
              <ArrowLeft size={14} aria-hidden /> Back to sessions
            </Link>
            {!notFound && (
              <button type="button" className="btn btn-primary" onClick={load}><RotateCw size={14} aria-hidden /> Retry</button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (!session) return <SessionLoader />;

  const inInterview = session.status === "in_progress" || started;
  const step = session.status === "completed" ? 3 : inInterview ? 2 : 1;

  return (
    <div className="fade-in">
      <Stepper current={step} />
      {session.status === "completed" ? (
        <Report session={session} />
      ) : inInterview ? (
        <Interview session={session} onCompleted={setSession} />
      ) : (
        <ProfilePlan session={session} onStart={() => setStarted(true)} starting={false} />
      )}
    </div>
  );
}
