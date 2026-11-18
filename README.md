# ScreenIQ — AI-Powered Role-Based Candidate Screening

A full-stack system that runs a **structured technical screening interview** where every question is
generated live from three inputs:

1. the candidate's **resume** (parsed into a structured profile),
2. the selected **job role**, and
3. a **role-specific knowledge base** built from the assignment's ML textbooks (RAG).

The interview **adapts** as it goes (difficulty moves with performance; partially-correct answers trigger a
probing follow-up), every question is **traceable** to the exact textbook passages it was generated from, and
the session ends with an evidence-based **report** and a **study plan that cites book pages**.

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router, React 19, TypeScript) |
| Backend | FastAPI, SQLAlchemy 2, Pydantic v2 |
| LLM | Groq (free tier) — `openai/gpt-oss-120b` + `openai/gpt-oss-20b` (low reasoning effort) via the OpenAI-compatible API |
| Embeddings | `BAAI/bge-small-en-v1.5` via fastembed (ONNX, local CPU, free) |
| Vector DB | ChromaDB (persistent, cosine HNSW) + BM25 (rank_bm25) for hybrid search |
| Database | SQLite by default (any SQLAlchemy URL, e.g. Postgres, via `DATABASE_URL`) |
| Ops | Docker (multi-stage, non-root), docker-compose, GitHub Actions CI |

### Product highlights
- **Guided 4-stage flow:** Upload & role → Profile & plan → Interview → Report, shown by a progress stepper.
  The stage comes from server state, so a refresh or a shared link resumes in the right place.
- **Interview workspace.**
  - A topic timeline with a live status and score per topic.
  - A running-average score ring, a difficulty meter, an answer timer and word count.
  - Answer drafts are saved automatically, and Ctrl+Enter submits.
  - Practice mode (feedback after each answer) or screening mode (feedback only in the final report).
- **Answer feedback.** A score ring, rubric bars (correctness / depth / clarity), covered vs missed points,
  misconceptions, and a "harder / easier next" indicator.
- **"Why this question?"** On every question it shows the retrieval queries, the passages retrieved (book,
  page, similarity, dense/BM25), which passages the generator cited, and the rationale.
- **Report.**
  - A recommendation, key-number tiles, and resume claims vs demonstrated ability.
  - A rubric breakdown, a chart of how difficulty adapted, and a per-topic breakdown.
  - A study plan that cites book pages, and the full transcript.
  - Print/PDF and JSON export.
- **Sessions dashboard** with stats, search, status filters and delete with confirmation.
- **Light and dark themes** (system default plus a manual toggle), a responsive layout, accessible controls,
  loading placeholders, and live backend/LLM status in the header.

---

## 1. Quick start

**Prerequisites:** Python 3.11+, Node 18+, a free Groq API key from https://console.groq.com/keys

```bash
# ---------- backend ----------
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # then set GROQ_API_KEY=... in .env

python -m scripts.download_books  # downloads the textbooks into data/books/
python -m scripts.ingest          # chunks + embeds them into ChromaDB (one-off, ~10-15 min on CPU)

uvicorn app.main:app --reload --port 8000     # API docs: http://localhost:8000/docs

# ---------- frontend (new terminal) ----------
cd frontend
npm install
cp .env.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                       # http://localhost:3000
```

A sample resume for demos is in [`samples/resume_ml_engineer.txt`](samples/resume_ml_engineer.txt).

**Or run everything with Docker:**

```bash
cp backend/.env.example backend/.env                       # set GROQ_API_KEY
docker compose run --rm backend python -m scripts.download_books
docker compose run --rm backend python -m scripts.ingest   # one-off knowledge-base build
docker compose up --build                                  # http://localhost:3000
```

**Tests** (offline: the LLM and retriever are faked):

```bash
cd backend && pip install -r requirements-dev.txt && pytest -q
```

> **Knowledge-base note:** one source link in the brief (Burkov's *Hundred-Page ML Book*) is served with an
> invalid TLS certificate, so the downloader refuses it rather than disabling verification. To include it,
> download it manually to `backend/data/books/burkov_hundred_page_ml.pdf` and run `python -m scripts.ingest burkov`.
> The AI/ML role still works from Mitchell + *ML for Absolute Beginners*.

---

## 2. System architecture

```
┌──────────────────────── Next.js frontend ────────────────────────┐
│ Setup (upload + role) → Profile & Plan → Interview → Report       │
│ state is server-driven: reloading /session/{id} resumes the stage │
└───────────────┬───────────────────────────────────────────────────┘
                │ REST (JSON / multipart)
┌───────────────▼──────────────── FastAPI backend ─────────────────────────────────┐
│ api/routes.py        HTTP only: validation, (de)serialisation, error mapping      │
│ services/                                                                          │
│   interview_service  lifecycle state machine + orchestration (business rules)     │
│   resume_parser      PDF/TXT → text → LLM structured profile (+ lexicon fallback) │
│   planner            profile + role → ordered topics w/ retrieval queries          │
│   question_generator topic → hybrid retrieval → grounded, personalised question    │
│   evaluator          rubric grading vs. expected points + retrieved context        │
│   report             deterministic analytics + LLM narrative                        │
│   llm                Groq client: JSON mode, retries, 429 backoff                   │
│ rag/                                                                               │
│   loader → chunker → embeddings → vector_store      (ingestion)                    │
│   retriever: multi-query dense + BM25 → RRF → grounding filter → MMR               │
└──────┬───────────────────────────────┬────────────────────────────┬──────────────┘
       │                               │                            │
  SQLite / Postgres              ChromaDB (vectors)            Groq LLM API
  sessions, questions,           textbook chunks +             (OpenAI-compatible)
  answers, reports               book/page metadata
```

### Interview flow (the pipeline)

```
Resume ──► Parse ──► Profile {level, skills, technologies, ML concepts, projects}
                         │
Role ────────────────────┼──► Planner ──► N topics, each with:
                         │                  resume_anchor | gap-probe, rationale,
                         │                  2-3 textbook-style retrieval queries,
                         │                  question type, base difficulty
                         ▼
             ┌──► Retrieve (role's books only) ──► Generate question (grounded in excerpts,
             │                                      personalised to resume, at target difficulty)
             │                                         │  stored with queries + chunks + rationale
             │                                         ▼
             │                                    Candidate answers
             │                                         ▼
             │            Evaluate (rubric vs expected points + excerpts) ──► store answer + evaluation
             │                                         │
             │        adapt: score ≥ 8 → difficulty+1 · score ≤ 4 → difficulty−1
             └──── next: follow-up (3.5 ≤ score < 7.5, same context) or next planned topic
                                                       ▼
                               Complete ──► analytics + narrative report ──► stored
```

### Lifecycle & API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | LLM configured? chunks per book |
| `GET` | `/api/roles` | roles, their books, KB readiness |
| `POST` | `/api/sessions` | multipart: resume + role → parse, plan, persist (`planned`) |
| `GET` | `/api/sessions` · `/api/sessions/{id}` | list / full detail (profile, plan, Q&A, report) |
| `POST` | `/api/sessions/{id}/questions/next` | pending question, or generate the next one (`in_progress`) |
| `POST` | `/api/sessions/{id}/questions/{qid}/answer` | evaluate, adapt difficulty, decide follow-up |
| `POST` | `/api/sessions/{id}/complete` | build + persist report (`completed`) |
| `GET` | `/api/sessions/{id}/report` | the report |
| `DELETE` | `/api/sessions/{id}` | delete session (cascade) |

State rules live in `interview_service`, not in the routes. The service raises domain errors, and `main.py`
maps them to HTTP codes: `404` not found, `409` invalid state, `422` bad resume or input, `502` LLM or
generation failure.
- `questions/next` is **idempotent**: if a question is pending, it is returned instead of generating a new one.
  Reloads and double-clicks never waste LLM calls or skip questions.
- Only one unanswered question at a time; a question cannot be answered twice; the question budget
  (follow-ups included) is enforced; completion is idempotent.

### Data model

```
sessions   id, candidate_name, role_id, status, resume_text, profile(JSON), plan(JSON),
           num_questions, current_difficulty, topic_cursor, timestamps
questions  id, session_id, position, kind(primary|follow_up), parent_question_id, topic,
           question_type, difficulty, text,
           rationale, retrieval_queries(JSON), context_chunks(JSON), expected_points(JSON)   ← traceability
answers    id, question_id(unique), text, skipped, time_taken_s, score, evaluation(JSON)
reports    id, session_id(unique), overall_score, content(JSON: analytics + narrative)
```

The full chain **Context → Question → Answer → Evaluation** is persisted, so any question can be traced back
to the queries that retrieved its context, the exact chunks (book, pages, similarity, which retriever found
them, whether the generator cited them) and the reasoning for asking it. The UI shows this under
**"Why this question?"**.

---

## 3. Key design decisions

### Knowledge ingestion
- **Page-level cleaning before chunking.** Textbooks include tables of contents, indexes, bibliographies and
  exercise lists. A simple filter removes these pages before they are embedded: it checks the share of
  letters on the page and how many lines look like TOC, index or citation entries. It also normalises
  ligatures (NFKC) and joins words hyphenated across lines. Junk chunks cause off-topic retrieval, so it is
  cheaper to remove them up front.
- **Sentence-aware chunks of ~1000 characters (~220 tokens) with ~180 characters of sentence overlap.**
  - Big enough to hold a full definition plus its explanation, so context is preserved.
  - Small enough that 4 excerpts fit the Groq free-tier token budget.
  - Never cut mid-sentence, so a chunk can be shown back to the user as a readable citation.
  - The overlap keeps an idea that spans a chunk boundary findable from either side.
- **One collection, `book_id` metadata.** Each book is embedded once, and a role is a metadata filter
  (`book_id IN role.books`). Books can be shared across roles and new roles cost nothing.
- **Local embeddings (bge-small, 384-d, ONNX).** Free, no API key, fast on CPU, and strong on retrieval
  for its size. Queries get the bge instruction prefix and passages don't (it is an asymmetric model).
  Ingestion is idempotent, and chunk IDs are deterministic (`book:index`).

### Retrieval (`rag/retriever.py`)
1. **Multi-query.** Each topic carries 2-3 queries that the planner writes the way a textbook would phrase
   the idea, plus one query that combines the topic with the resume anchor.
2. **Hybrid search: dense + BM25.**
   - Dense search catches paraphrases ("overfitting" ≈ "poor generalisation").
   - BM25 catches exact terms and acronyms (EM, ID3, SVM) that small embedding models blur.
3. **Reciprocal Rank Fusion.** Merges the ranked lists without having to calibrate their different score
   scales.
4. **Grounding filter.** A chunk must have cosine similarity ≥ 0.45 to the average of the query vectors.
   This stops BM25 keyword coincidences from putting irrelevant text in the prompt. If nothing passes, the
   filter is relaxed rather than returning nothing.
5. **MMR (λ=0.7)** picks the final 4 chunks so they are relevant without repeating each other (neighbouring
   chunks overlap).
6. **Novelty penalty.** Chunks already used earlier in the session are down-weighted, so later questions
   explore new material.

### Question generation
- The prompt contains the topic, the resume anchor, a short candidate summary, the target difficulty with an
  explicit rubric for levels 1-5, the question type, the previously asked questions (to avoid repeats) and
  labelled excerpts `[E1..E4]`.
- The model must return `used_excerpts`, `expected_points` and a `rationale`. These are stored and drive both
  traceability and grading.
- Generic or template questions are explicitly banned. Questions anchored to the resume refer to the
  candidate's own experience ("You used XGBoost for credit default…").

### How the resume shapes the interview
- **Topic selection.** About 60% of topics are anchored to resume items that fall within the role's areas
  (to check that claimed knowledge is real). The rest probe core role areas missing from the resume (to find
  gaps).
- **Difficulty.**
  - The starting level comes from experience level and the breadth of ML concepts on the resume.
  - Each question's difficulty blends a running level (60%) with the planner's per-topic estimate (40%).
  - The running level goes up 1 after a score ≥ 8 and down 1 after a score ≤ 4.
- **Direction.** Partially correct answers (3.5 ≤ score < 7.5, i.e. "adequate" but not "strong") get one follow-up that probes the specific missed points,
  using the same retrieved context.

### Evaluation and reporting
- **Answer scoring.** The LLM fills in a rubric (correctness, depth, clarity) and lists covered points,
  missed points and misconceptions. The **score is computed in code**: `0.5·correctness + 0.3·depth +
  0.2·clarity`. This keeps scoring consistent and explainable. Empty or skipped answers score 0 without an
  LLM call.
- **Report numbers are computed in code.** Code produces:
  - an overall score weighted by difficulty (a 9 on a level-5 question counts for more than a 9 on a
    level-1 question),
  - the per-topic breakdown,
  - the average for resume-anchored topics vs gap-probe topics,
  - the score and difficulty per question,
  - the study plan, which maps weak topics to the **exact book pages** their questions were built from.

  The LLM only writes the narrative on top (headline, strengths and gaps, how well the resume matched
  performance, recommendation).

### Reliability on the Groq free tier
- **Two models.**
  - `gpt-oss-20b` handles extraction and planning: structured tasks with high volume.
  - `gpt-oss-120b` handles question generation, grading and the report, where quality matters.
- **Every LLM call uses JSON mode and is parsed defensively.**
  - Retries with exponential backoff.
  - Respects `retry-after` on 429 responses.
  - Retries `json_validate_failed` errors.
- **Fallbacks for the non-critical steps.**
  - Resume extraction falls back to a keyword lexicon.
  - Planning falls back to a deterministic plan built from resume concepts and role areas.
  - The report falls back to a narrative based on score thresholds.

  A provider hiccup therefore degrades quality, not availability.
- **Fast first request.** The embedding model and BM25 indexes load in a background thread at startup.

### Frontend
- **Server-driven state.** The session page derives its stage (plan → interview → report) from the
  session's status and questions. A refresh or shared link resumes in the right place.
- **Answer drafts survive reloads.** They are saved per question in localStorage.
- **Practice mode toggle.** Shows grading feedback after each answer, or hides it for a real
  screening-style run.
- **Stage-specific loading messages.** For example "Retrieving relevant textbook passages…".

### Production hardening
- **Concurrency safety.**
  - State-changing operations (`next`, `answer`, `complete`) run under a per-session lock, so double
    clicks or two open tabs can't generate two questions or record an answer twice. A test covers this.
  - A `UNIQUE(session_id, position)` database constraint backs this up when several processes run.
    A conflict returns `409`.
- **Observability.**
  - Every request gets an `X-Request-ID` (passed through from the caller if present) and a latency log line.
  - Error responses carry the `request_id`.
  - Unhandled errors are logged with their stack trace server-side, and only a generic `500` reaches the
    client.
- **Errors are typed end to end.** Domain errors map to `404`, `409`, `422` and `502` with a consistent
  JSON body `{error, detail, request_id}`.
- **Containers.**
  - The backend image runs as a non-root user and has a health check.
  - The frontend is a multi-stage Next.js `standalone` build, also running as non-root.
  - Compose waits for the backend to report healthy before starting the frontend.
  - Data (books, vector index, SQLite, model cache) lives in a mounted volume.
- **Security headers** on the frontend: `nosniff`, `DENY` framing, and a strict referrer policy. The
  `X-Powered-By` header is turned off.
- **CI.** GitHub Actions runs the offline backend test suite plus the frontend type-check and production
  build on every push and pull request.
- **Scaling path.**
  - Swap SQLite for Postgres via `DATABASE_URL`.
  - Run several API workers; the database constraint still prevents duplicate questions.
  - Point Chroma at a server instance.
  - The LLM provider is behind one client class (`services/llm.py`).

---

## 4. Configuration

All settings are environment variables (see [`backend/.env.example`](backend/.env.example)): models,
temperature, chunk size and overlap, retrieval `top_k`, candidate pool, similarity floor, MMR λ, the number
of questions, the follow-up limit, CORS and storage paths.

## 5. Project layout

```
backend/
  app/
    main.py            FastAPI app, lifespan warm-up, error mapping
    config.py          env-driven settings
    roles.py           role catalogue + role → books mapping
    db.py, models.py   SQLAlchemy engine + ORM models
    schemas.py         API contracts
    api/routes.py      HTTP layer
    services/          interview_service, resume_parser, planner, question_generator,
                       evaluator, report, llm, prompts
    rag/               loader, chunker, embeddings, vector_store, retriever, ingest
  scripts/             download_books.py, ingest.py
  tests/               offline lifecycle, concurrency + unit tests
  Dockerfile
frontend/
  src/app/             / (setup), /session/[id] (plan → interview → report), /sessions
  src/components/      Header, Stepper, ProfilePlan, Interview, Report, common (Sources, ScoreRing…)
  Dockerfile
  src/lib/             typed API client + types
samples/               demo resume
docker-compose.yml     one-command deployment
.github/workflows/     CI (backend tests, frontend type-check + build)
```

## 6. Possible extensions
- Stream question generation (SSE) and voice answers (Whisper on Groq).
- Re-rank with a cross-encoder after RRF, and add a retrieval evaluation set (recall@k on labelled topic → page pairs).
- Recruiter view comparing candidates for the same role, plus auth and multi-tenancy.
