import { z } from "zod";

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(10000).default(10),
  q: z.string().trim().optional(),
});

export const createIngredientSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),

  // unit: z.string().trim().max(20).optional().nullable(),
  minStockLevel: z.coerce.number().min(0).default(0),
  price: z.coerce.number().min(0).optional(),
  uomId: z.coerce.number().int().positive().optional(),
  groupId: z.coerce.number().int().positive().optional().nullable(),
});

export const updateIngredientSchema = createIngredientSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });
