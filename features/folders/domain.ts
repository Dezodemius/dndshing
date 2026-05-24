import { z } from "zod";

export const FolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().nullable(),
  gameDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  userId: z.string().uuid()
});

export const CreateFolderInputSchema = z.object({
  name: z.string().trim().min(1, "Название обязательно").max(120),
  description: z.string().trim().max(1000).optional(),
  gameDate: z.string().trim().optional()
});

export const DeleteFolderInputSchema = z.object({
  folderId: z.string().uuid()
});

export type Folder = z.infer<typeof FolderSchema>;
export type CreateFolderInput = z.infer<typeof CreateFolderInputSchema>;
