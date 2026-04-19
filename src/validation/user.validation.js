import { z } from "zod";

export const createUserSchema = z.object({
    username: z.string().min(3).max(50),
    full_name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    employee_code: z.string().optional(),
    role_id: z.number().int(),
    department_id: z.number().int().nullable().optional(),
    phone_number: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
    job_title: z.string().optional().nullable(),
    is_active: z.boolean().optional(),
});

export const updateUserSchema = z.object({
    full_name: z.string().optional(),
    email: z.string().email().optional(),
    employee_code: z.string().optional(),
    is_active: z.boolean().optional(),
    role_id: z.number().int().optional(),
    department_id: z.number().int().nullable().optional(),

    phone_number: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
    job_title: z.string().optional().nullable(),
});

export const resetPasswordSchema = z.object({
    newPassword: z.string().min(6)
});