"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BriefcaseBusiness, Check, ChevronsUpDown } from "lucide-react";
import type { Role } from "@/lib/types";
import styles from "./RoleSelect.module.css";

/** Compact single-select dropdown (WAI-ARIA listbox pattern) for the target role. */
export default function RoleSelect({ roles, value, onChange, disabled }: {
  roles: Role[] | null;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selected = roles?.find((r) => r.id === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open || !roles) return;
    setActive(Math.max(0, roles.findIndex((r) => r.id === value)));
    listRef.current?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (roles === null) return <div className={`skeleton ${styles.skeleton}`} aria-hidden />;
  if (roles.length === 0) return <p className="text-sm muted">No roles available. Check that the backend is running.</p>;
  const list = roles;

  function move(dir: 1 | -1) {
    for (let step = 1; step <= list.length; step++) {
      const j = (active + dir * step + list.length) % list.length;
      if (list[j].ready) { setActive(j); return; }
    }
  }

  function choose(i: number) {
    const r = list[i];
    if (!r?.ready) return;
    onChange(r.id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); move(1); break;
      case "ArrowUp": e.preventDefault(); move(-1); break;
      case "Enter": case " ": e.preventDefault(); choose(active); break;
      case "Escape": case "Tab": setOpen(false); triggerRef.current?.focus(); break;
    }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}
      >
        <span className={styles.lead} aria-hidden><BriefcaseBusiness size={14} /></span>
        <span className={`${styles.title} ${selected ? "" : styles.placeholder}`}>{selected?.title ?? "Select a role"}</span>
        <ChevronsUpDown size={15} className={styles.chevron} aria-hidden />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listId}-${active}`}
          className={`${styles.popover} ${styles.list} fade-in`}
          onKeyDown={onKey}
        >
          {list.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={r.id === value}
              aria-disabled={!r.ready}
              title={r.description}
              className={`${styles.option} ${i === active ? styles.optionActive : ""} ${!r.ready ? styles.optionDisabled : ""}`}
              onMouseEnter={() => r.ready && setActive(i)}
              onClick={() => choose(i)}
            >
              <span className={styles.title}>{r.title}</span>
              {!r.ready && <span className={styles.meta}>Not indexed</span>}
              <span className={styles.check} aria-hidden>{r.id === value && <Check size={14} />}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
