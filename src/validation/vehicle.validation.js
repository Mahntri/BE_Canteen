import { z } from "zod";

export const listVehicleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  groupId: z.coerce.number().int().optional(),
  expiringSoon: z.coerce.boolean().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const createVehicleSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  plateNumber: z.string().trim().min(1).max(20),
  type: z.string().trim().min(1).max(50),
  seatCapacity: z.coerce.number().int().min(1),

  yearOfManufacture: z.coerce.number().int().optional(),
  color: z.string().trim().optional().nullable(),
  fuelType: z.string().trim().optional().nullable(),

  insuranceExpiry: z.string().optional().nullable(),     
  registrationExpiry: z.string().optional().nullable(),

  lastMaintenanceDate: z.string().optional().nullable(),
  nextMaintenanceDate: z.string().optional().nullable(),

  status: z.string().optional(),
  currentLocation: z.string().optional().nullable(),

  groupId: z.coerce.number().int().optional().nullable(),
});

export const updateVehicleSchema = createVehicleSchema.partial();
