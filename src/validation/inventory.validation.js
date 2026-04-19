import { z } from "zod";

export const stockListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  q: z.string().trim().optional(),
});