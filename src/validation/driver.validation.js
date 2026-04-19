import { z } from "zod";

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createDriverSchema = z.object({
    userId: z.string().uuid(),
    licenseNumber: z.string().min(1, "Số bằng lái là bắt buộc"),
    licenseClass: z.string().min(1, "Hạng bằng là bắt buộc"),
    licenseExpiry: z.string().refine(v => ymdRegex.test(v) || !isNaN(Date.parse(v)), {
        message: "Ngày hết hạn không hợp lệ. Định dạng yêu cầu: YYYY-MM-DD hoặc ISO DateTime"
    }),
    yearsOfExperience: z.number().min(0).default(0),
    status: z.enum(["AVAILABLE", "ON_TRIP", "OFF_DUTY"]).optional()
});

export const updateDriverSchema = z.object({
    licenseNumber: z.string().optional(),
    licenseClass: z.string().optional(),
    licenseExpiry: z.string().refine(v => ymdRegex.test(v) || !isNaN(Date.parse(v)), {
        message: "Ngày hết hạn không hợp lệ"
    }).optional(),
    yearsOfExperience: z.number().min(0).optional(),
    status: z.enum(["AVAILABLE", "ON_TRIP", "OFF_DUTY"]).optional()
});

export const ratingSchema = z.object({
    bookingId: z.string().uuid(),
    
    attitudeScore: z.number().int().min(1).max(5),
    vehicleQualityScore: z.number().int().min(1).max(5),
    waitTimeScore: z.number().int().min(1).max(5),
    comfortScore: z.number().int().min(1).max(5),
    
    comment: z.string().optional()
});