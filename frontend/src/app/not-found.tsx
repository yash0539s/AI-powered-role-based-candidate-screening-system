import Link from "next/link";
import { ArrowRight, Compass, History } from "lucide-react";
import { EmptyState } from "@/components/common";

export default function NotFound() {
  return (
    <div className="card fade-in" style={{ maxWidth: 520, margin: "56px auto 0" }}>
      <EmptyState
        icon={<Compass size={20} />}
        title="Page not found"
        text="This page doesn't exist or has moved."
        action={
          <>
            <Link href="/sessions" className="btn btn-secondary"><History size={14} /> Sessions</Link>
            <Link href="/" className="btn btn-primary">New screening <ArrowRight size={14} /></Link>
          </>
        }
      />
    </div>
  );
}
