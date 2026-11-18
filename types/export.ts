export const scoreExportFormats = ["xlsx", "pdf", "csv", "docx"] as const;

export type ScoreExportFormat = (typeof scoreExportFormats)[number];
export type ScoreExportRow = Record<string, string | number>;

export type ScoreReportDetails = {
  school: string;
  title: string;
  subject: string;
  classroom: string;
  term: number;
  year: number;
};
