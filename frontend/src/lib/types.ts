export interface Book {
  id: string;
  title: string;
  author: string;
  chunks: number;
}

export interface Role {
  id: string;
  title: string;
  category: string;
  description: string;
  core_areas: string[];
  books: Book[];
  ready: boolean;
}

export interface ContextChunk {
  id: string;
  label: string;
  text: string;
  book_id: string;
  book_title: string;
  page_start: number;
  page_end: number;
  similarity: number;
  fused_score: number;
  matched_by: string[];
  used: boolean;
}

export interface Evaluation {
  rubric: { correctness: number; depth: number; clarity: number };
  covered_points: string[];
  missed_points: string[];
  misconceptions: string[];
  feedback: string;
  verdict: "strong" | "adequate" | "weak" | "no_answer" | "unevaluated";
  score: number;
}

export interface Answer {
  id: string;
  text: string;
  skipped: boolean;
  time_taken_s: number | null;
  score: number;
  evaluation: Evaluation;
  created_at: string;
}

export interface Question {
  id: string;
  position: number;
  kind: "primary" | "follow_up";
  parent_question_id: string | null;
  topic: string;
  question_type: string;
  difficulty: number;
  text: string;
  rationale: string;
  retrieval_queries: string[];
  context_chunks: ContextChunk[];
  expected_points: string[];
  created_at: string;
  answer: Answer | null;
}

export interface CandidateQuestion {
  id: string;
  position: number;
  kind: "primary" | "follow_up";
  topic: string;
  question_type: string;
  difficulty: number;
  text: string;
  rationale: string;
  retrieval_queries: string[];
  context_chunks: ContextChunk[];
  total_questions: number;
}

export interface PlanTopic {
  topic: string;
  resume_anchor: string | null;
  why: string;
  queries: string[];
  question_type: string;
  base_difficulty: number;
}

export interface Profile {
  candidate_name: string | null;
  summary: string;
  experience_level: string;
  years_experience: number;
  skills: string[];
  technologies: string[];
  domains: string[];
  ml_concepts: string[];
  projects: { name: string; summary: string; technologies: string[] }[];
  education: string;
  extraction_source: string;
}

export interface TopicStat {
  topic: string;
  score: number;
  questions: number;
  resume_anchored: boolean;
  level: "strong" | "adequate" | "weak";
}

export interface ReportContent {
  analytics: {
    overall_score: number;
    raw_average: number;
    answered: number;
    skipped: number;
    follow_ups: number;
    rubric_average: { correctness: number; depth: number; clarity: number };
    topics: TopicStat[];
    resume_anchored_avg: number | null;
    non_resume_avg: number | null;
    trajectory: { position: number; difficulty: number; score: number; kind: string }[];
    avg_time_s: number | null;
    study_plan: { topic: string; score: number; references: { book: string; pages: string }[] }[];
  };
  narrative: {
    headline: string;
    summary: string;
    strengths: string[];
    gaps: string[];
    resume_alignment: string;
    recommendation: "advance" | "consider" | "do_not_advance";
    recommendation_reason: string;
  };
}

export interface SessionDetail {
  id: string;
  candidate_name: string;
  role_id: string;
  role_title: string;
  status: "planned" | "in_progress" | "completed";
  resume_filename: string | null;
  profile: Profile;
  plan: { topics: PlanTopic[]; source: string; initial_difficulty: number };
  num_questions: number;
  current_difficulty: number;
  created_at: string;
  completed_at: string | null;
  questions: Question[];
  report: { overall_score: number; content: ReportContent; created_at: string } | null;
}

export interface SessionSummary {
  id: string;
  candidate_name: string;
  role_id: string;
  role_title: string;
  status: string;
  num_questions: number;
  answered: number;
  overall_score: number | null;
  created_at: string;
}

export interface AnswerResult {
  question_id: string;
  score: number;
  evaluation: Evaluation;
  difficulty_before: number;
  difficulty_after: number;
  questions_remaining: number;
  next_action: "next_question" | "complete";
  will_follow_up: boolean;
}
