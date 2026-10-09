import type { Choice } from "./exam";
export type AnswerState =
  "valid" | "blank" | "multiple" | "ambiguous" | "unreadable";
export type SubmissionStatus =
  "scanned" | "needs_review" | "verified" | "published" | "voided";
export type Observation = {
  question: number;
  choice: Choice | null;
  state: AnswerState;
};
export type ReviewItem = {
  id: string;
  examId: string;
  examVersion?: number;
  studentCode: string;
  name: string;
  classroom: string;
  number: number | null;
  reason: string;
  status: SubmissionStatus;
  rawAnswers: Observation[];
  corrections: Record<number, Choice | null>;
  resolved: number[];
  audit: {
    at: string;
    reason: string;
    question: number;
    before: Choice | null;
    after: Choice | null;
  }[];
};
