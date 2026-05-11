import { z } from "zod";

/**
 * Folder names accepted at the API boundary.
 *
 * Rules:
 *   - 1..255 chars after trimming
 *   - No `/` (caller would silently create nested folders without realising)
 *   - No control characters (S3 accepts them but they're trouble in URLs)
 *   - No leading/trailing whitespace (we trim before validation)
 *
 * The full prefix is computed server-side as `parent_prefix + name + "/"`,
 * which keeps the client honest about where it's writing.
 */
const FOLDER_NAME = /^[^/\x00-\x1F\x7F]+$/;

export const createFolderSchema = z.object({
  /** Folder name only — no slashes. Trimmed before validation. */
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Name is required").max(255, "Name too long").regex(FOLDER_NAME, "Folder names can't contain '/' or control characters")),
  /**
   * Parent prefix, e.g. "reports/" or "reports/2026/". Empty / omitted
   * means the folder is created at the bucket root. Must end in "/" if
   * present; the controller normalizes either way.
   */
  parent_prefix: z.string().max(1024).optional().default(""),
});
export type CreateFolderDto = z.infer<typeof createFolderSchema>;

export const listFoldersQuerySchema = z.object({
  /** When set, returns only markers whose prefix starts with this value. */
  prefix: z.string().max(1024).optional(),
});
export type ListFoldersQuery = z.infer<typeof listFoldersQuerySchema>;

/**
 * Folder prefix for preview / purge. Must be non-empty (refusing `""`
 * is what stops a recursive delete from wiping the whole bucket) and
 * always normalized to end with `/`.
 */
const FOLDER_PREFIX = z
  .string()
  .min(1, "prefix is required")
  .max(1024, "prefix is too long")
  .regex(/\/$/u, "prefix must end with '/'")
  .refine((v) => !/(^|\/)(\.\.?)\//.test(v), "prefix can't contain '.' or '..'");

export const folderPreviewQuerySchema = z.object({
  prefix: FOLDER_PREFIX,
});
export type FolderPreviewQuery = z.infer<typeof folderPreviewQuerySchema>;

export const purgeFolderSchema = z.object({
  prefix: FOLDER_PREFIX,
});
export type PurgeFolderDto = z.infer<typeof purgeFolderSchema>;
