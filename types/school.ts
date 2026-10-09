import { z } from "zod";
export const workspaceSettingsSchema = z.object({
  academicYear: z.number().int().min(2500).max(2700),
  term: z.number().int().min(1).max(3),
  subjects: z.array(z.string().trim().min(1).max(80)).max(50),
});
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export const defaultWorkspaceSettings: WorkspaceSettings = {
  academicYear: 2569, term: 1, subjects: [],
};
export const updateWorkspaceSchema = z.object({
  school: z.string().trim().min(1).max(60),
  settings: workspaceSettingsSchema,
});
export type SchoolBranding = {
  school: string;
  image_url: string | null;
  image_public_id: string | null;
  revision: string;
  settings?: WorkspaceSettings;
  canUpload?: boolean;
  cleanupPending?: number;
};
