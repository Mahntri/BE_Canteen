import { z } from "zod";

export const listUomQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
});

export const createUomSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().optional().nullable(),
});

export const updateUomSchema = createUomSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });
