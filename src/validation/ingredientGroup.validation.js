import { z } from "zod";

export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    q: z.string().optional().default(""),
});

export const createGroupSchema = z.object({
    code: z.string().min(2).max(50).optional(),
    name: z.string().min(2).max(100),
    description: z.string().optional(),
});

export const updateGroupSchema = createGroupSchema.partial();
