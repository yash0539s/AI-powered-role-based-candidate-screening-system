import { Fragment } from "react";
import { Check } from "lucide-react";

const STEPS = ["Upload & role", "Profile & plan", "Interview", "Report"];
const LABEL_RESET: React.CSSProperties = { margin: 0, color: "inherit", fontWeight: "inherit", fontSize: "inherit" };

/** Pill-shaped progress through the screening lifecycle. `current` is the 0-based active step. */
export default function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Screening progress" className="no-print">
      <ol className="stepper">
        {STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <Fragment key={label}>
              {i > 0 && <li className={`step-sep${i <= current ? " done" : ""}`} aria-hidden />}
              <li
                className={`step${active ? " active" : ""}${done ? " done" : ""}`}
                aria-current={active ? "step" : undefined}
              >
                <span className="num" aria-hidden>{done ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                {/* `.label` is what globals.css hides on mobile; reset the form-label styles it also carries */}
                <span className="label" style={LABEL_RESET}>{label}</span>
                {done && <span className="sr-only">(completed)</span>}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
