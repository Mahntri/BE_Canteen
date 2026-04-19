import { z } from "zod";

export const createVehicleDocSchema = z.object({
  docType: z.string().trim().min(1).max(50),
  title: z.string().trim().max(150).optional().nullable(),
  fileKey: z.string().trim().min(1).max(255),
  url: z.string().url().optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});
