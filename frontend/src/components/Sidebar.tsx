"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown, History, Moon, Plus, Sun } from "lucide-react";
import { api } from "@/lib/api";
import type { Role } from "@/lib/types";
import { Logo } from "./common";
import styles from "./Sidebar.module.css";

type Health = "checking" | "ok" | "down";
type Theme = "light" | "dark";

function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    const cur = document.documentElement.dataset.theme;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState(cur === "dark" || (!cur && prefersDark) ? "dark" : "light");
  }, []);
  const setTheme = (next: Theme) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* storage unavailable */ }
  };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, setTheme, toggle };
}

export default function Sidebar() {
  const path = usePathname() ?? "/";
  const { theme, setTheme, toggle } = useTheme();
  const [health, setHealth] = useState<Health>("checking");
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const kbId = useId();

  useEffect(() => {
    let alive = true;
    const ping = () =>
      api.health().then((h) => alive && setHealth(h.llm_configured ? "ok" : "down")).catch(() => alive && setHealth("down"));
    ping();
    api.roles().then((r: Role[]) => alive && setRoles(r)).catch(() => alive && setRoles((cur) => cur ?? []));
    api.listSessions().then((s) => alive && setSessionCount(s.length)).catch(() => {});
    const t = setInterval(ping, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [path]);

  // Unique books across roles (a book can serve several roles).
  const books = new Map<string, number>();
  roles?.forEach((r) => r.books.forEach((b) => books.set(b.id, b.chunks)));
  const total = books.size;
  let indexed = 0;
  let passages = 0;
  books.forEach((n) => { if (n > 0) { indexed += 1; passages += n; } });

  const isNew = path === "/";
  const isSessions = path.startsWith("/sessions") || path.startsWith("/session/");
  const statusText = health === "ok" ? "All systems operational" : health === "down" ? "Backend or LLM unavailable" : "Connecting…";
  const statusTone = health === "ok" ? "good live" : health === "down" ? "bad" : "";

  return (
    <>
      <aside className="sidebar" aria-label="Primary">
        <Link href="/" className="sidebar-brand" aria-label="ScreenIQ home">
          <Logo />
        </Link>

        <nav aria-label="Main" className={styles.nav}>
          <Link href="/" className={`nav-item ${isNew ? "active" : ""}`} aria-current={isNew ? "page" : undefined}>
            <Plus size={16} /> New screening
          </Link>
          <Link href="/sessions" className={`nav-item ${isSessions ? "active" : ""}`} aria-current={isSessions ? "page" : undefined}>
            <History size={16} /> Sessions
            {sessionCount !== null && <span className="count" aria-label={`${sessionCount} sessions`}>{sessionCount}</span>}
          </Link>
        </nav>

        {/* ---------------------------------------------------------- knowledge base */}
        <section className={styles.kb} aria-label="Knowledge base">
          <div className={styles.kbHead}>
            <span className={styles.kbIcon}><BookOpen size={14} aria-hidden /></span>
            <span className={styles.kbTitle}>Knowledge base</span>
            {roles && total > 0 && <span className={`${styles.kbRatio} nums`}>{indexed}/{total}</span>}
          </div>

          {roles === null ? (
            <div className="stack-sm" aria-hidden>
              <div className="skeleton text" style={{ width: "85%" }} />
              <div className="skeleton" style={{ height: 4, borderRadius: 4 }} />
            </div>
          ) : total === 0 ? (
            <p className={styles.kbMeta}>No books found.</p>
          ) : (
            <>
              <p className={styles.kbMeta}>
                <span className="nums">{indexed} of {total}</span> books indexed · <span className="nums">{passages.toLocaleString()}</span> passages
              </p>
              <div
                className="progress thin" role="progressbar" aria-label="Books indexed"
                aria-valuemin={0} aria-valuemax={total} aria-valuenow={indexed}
              >
                <div style={{ width: `${(indexed / total) * 100}%` }} />
              </div>
              <button
                type="button" className={styles.kbToggle} aria-expanded={kbOpen} aria-controls={kbId}
                onClick={() => setKbOpen((o) => !o)}
              >
                {kbOpen ? "Hide books" : "View books by role"}
                <ChevronDown size={13} className={kbOpen ? styles.chevOpen : undefined} aria-hidden />
              </button>
              {kbOpen && (
                <div id={kbId} className={`${styles.kbList} fade-in`}>
                  {roles.map((r) => (
                    <div key={r.id} className={styles.kbGroup}>
                      <div className={styles.kbRole}>{r.title}</div>
                      {r.books.map((b) => (
                        <div key={b.id} className={styles.kbBook} title={`${b.title} — ${b.author}`}>
                          <span className={`status-dot ${b.chunks ? "good" : ""}`} aria-hidden />
                          <span className="truncate">{b.title}</span>
                          <span className={`${styles.kbN} nums`}>{b.chunks ? b.chunks.toLocaleString() : "Not indexed"}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* ---------------------------------------------------------- footer */}
        <div className="sidebar-footer">
          <div className={styles.status} role="status" title={statusText}>
            <span className={`status-dot ${statusTone}`} aria-hidden />
            <span className="truncate">{statusText}</span>
          </div>
          <div className={styles.theme} role="group" aria-label="Theme">
            <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
              <Sun size={14} aria-hidden /> Light
            </button>
            <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
              <Moon size={14} aria-hidden /> Dark
            </button>
          </div>
        </div>
      </aside>

      <div className="mobile-bar">
        <Link href="/" className="sidebar-brand" aria-label="ScreenIQ home">
          <Logo size={28} />
        </Link>
        <nav aria-label="Main" className="row nowrap" style={{ gap: 2 }}>
          <Link href="/" className="btn btn-ghost btn-sm" aria-current={isNew ? "page" : undefined}><Plus size={14} /> New</Link>
          <Link href="/sessions" className="btn btn-ghost btn-sm" aria-current={isSessions ? "page" : undefined}><History size={14} /> Sessions</Link>
        </nav>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </>
  );
}
