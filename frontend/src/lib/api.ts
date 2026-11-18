import type {
  AnswerResult,
  CandidateQuestion,
  Role,
  SessionDetail,
  SessionSummary,
} from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(0, `Cannot reach the backend at ${API_URL}. Is it running?`);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<{ status: string; llm_configured: boolean; knowledge_base: Record<string, number> }>("/api/health"),
  roles: () => request<Role[]>("/api/roles"),
  listSessions: () => request<SessionSummary[]>("/api/sessions"),
  getSession: (id: string) => request<SessionDetail>(`/api/sessions/${id}`),
  deleteSession: (id: string) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),

  createSession: (form: { resume: File; roleId: string; name: string; numQuestions: number }) => {
    const fd = new FormData();
    fd.append("resume", form.resume);
    fd.append("role_id", form.roleId);
    fd.append("candidate_name", form.name);
    fd.append("num_questions", String(form.numQuestions));
    return request<SessionDetail>("/api/sessions", { method: "POST", body: fd });
  },

  nextQuestion: (id: string) =>
    request<CandidateQuestion>(`/api/sessions/${id}/questions/next`, { method: "POST" }),

  answer: (id: string, qid: string, body: { answer: string; skipped?: boolean; time_taken_s?: number }) =>
    request<AnswerResult>(`/api/sessions/${id}/questions/${qid}/answer`, json(body)),

  complete: (id: string) => request<SessionDetail>(`/api/sessions/${id}/complete`, { method: "POST" }),
};
