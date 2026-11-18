# Demo video script (6–7 minutes)

Lines in quotes are what to say to the reviewers.

## Before you record (checklist)
1. Start the **backend** (`uvicorn app.main:app --port 8000`) and **frontend** (`npm run dev`). The sidebar should say **"All systems operational"**.
2. Press **Ctrl+Shift+R** to load the newest UI.
3. On the **Sessions** page, delete old test sessions but **keep one completed demo session**, so you can show the full report without waiting.
4. Have the resume file ready: `samples/resume_ml_engineer.txt`.
5. Open these tabs in this order:
   1. the app (`localhost:3000`)
   2. the API docs (`localhost:8000/docs`)
   3. VS Code with the README
6. Use **Light mode** and **110% browser zoom** so text is readable on video.

## Part 1: Intro (0:00–0:30)
**Show:** the "New screening" page.
> "Hi, I'm Yash. This is ScreenIQ, an AI-powered, role-based candidate screening system. It reads a resume, builds a personalised interview, and generates every question from the role's textbooks using RAG. The interview adapts to each answer and ends with a scored report."

## Part 2: Setup, role and resume (0:30–1:30)
**Do:**
- Open **Knowledge base → View books by role** in the sidebar.
- Open the **Role dropdown** and show the 3 roles.
- Pick **AI / ML Engineer**.
- Upload the resume.
- Choose **4 questions**.
- Click **Analyse resume**.

> "The knowledge base is the assignment's textbooks. I split them into about 5,000 passages, embedded them locally, and stored them in ChromaDB. Each role searches only its own books. For example, AI / ML Engineer uses Tom Mitchell and ML for Absolute Beginners."

> "While it analyses, you can see the pipeline: parse the resume, plan topics, then retrieve from the textbooks."

## Part 3: Profile and interview plan (1:30–2:30)
**Show:** the extracted skills and projects, then the plan timeline.

> "The AI extracted the candidate's skills, technologies, ML concepts and projects. Then it built a plan. Some topics verify claims from the resume. Others are gap probes, which test important topics the resume doesn't mention. Starting difficulty depends on the candidate's experience level."

**Click:** **Start interview**.

## Part 4: Live interview, the core RAG part (2:30–4:15)
**Do:**
1. Read the question. Point out that it mentions the candidate's own project.
2. Open **"Why this question?"** and show the retrieved passages, book, page, similarity score, and the dense + BM25 tags.
3. Type a **short, partly correct** answer and submit with Ctrl+Enter.
4. Show the feedback: score ring, correctness / depth / clarity, covered vs missed points.
5. Click **"Continue to follow-up"**.

> "This question was not written in advance. The system made search queries from the resume and the role, searched the textbooks with hybrid search (vector search plus keyword search), picked the 4 best passages, and asked the AI to write a question grounded in them. 'Why this question?' shows the exact pages, so every question is traceable."

> "My answer was only partly correct, so the system asks a follow-up on what I missed. Difficulty also changes: a strong answer makes the next question harder, a weak one makes it easier."

**Point to the right panel:** progress, running average, topic timeline.

## Part 5: Report (4:15–5:30)
**Do:** go to **Sessions** and open the completed demo report.
- Show the recommendation and the score ring.
- Scroll to the **key numbers**.
- Show **Strengths / Gaps**.
- Show **Resume claims vs evidence**.
- Show the **adaptive trajectory chart**.
- Show the **study plan** with book pages.
- Show the **transcript**.
- Click **Export PDF**.

> "At the end, the system creates a structured report. The numbers are calculated in code, so they are exact and repeatable: a difficulty-weighted score, scores per topic, and a comparison of resume claims against real answers. The AI only writes the summary text. The study plan points to the exact textbook pages for weak topics. Everything is saved in the database, and the report can be exported as PDF."

## Part 6: Backend and architecture (5:30–6:40)
**Show:** `localhost:8000/docs`.
> "The backend is FastAPI. The API follows the interview lifecycle: create session, next question, answer, complete, report. The rules live in a service layer. For example, you can't answer the same question twice, and double clicks can't create duplicate questions."

**Show:** the README architecture diagram.
> "The frontend is Next.js, the backend is FastAPI, SQLite stores sessions, questions, answers and reports, ChromaDB stores the vectors, and Groq runs the LLM. The README explains my design choices: chunk size, hybrid search, and why scoring is done in code."

**Optional (10 sec):** run `pytest` and show the tests passing.

## Part 7: Closing (6:40–7:00)
> "To sum up: questions are grounded in textbooks and traceable to pages, the interview adapts in real time, everything is stored in a database, and the code is modular, with tests, Docker and CI. Thank you."

## Tips
- **Keep it under 7 minutes.** If the AI is slow, keep talking over the loading screens.
- **Use the ready demo report** for Part 5 so you don't have to answer every question live.
- **If something fails live**, say "the system retries automatically" and continue.
