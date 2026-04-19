import { z } from "zod";

export const createDepartmentSchema = z.object({
    orgId: z.number({ required_error: "ID tổ chức là bắt buộc" }).int(),
    code: z.string({ required_error: "Mã phòng ban là bắt buộc" })
           .min(1, "Mã phòng ban không được để trống")
           .trim(),
    name: z.string({ required_error: "Tên phòng ban là bắt buộc" })
           .min(1, "Tên phòng ban không được để trống")
           .trim(),  
    parentId: z.number().int().nullable().optional(),
    type: z.enum(["UNIT", "GROUP"]).default("UNIT"),
    isCostCenter: z.boolean().default(false),
    costCenterCode: z.string().nullable().optional(),
    managerId: z.string().uuid().nullable().optional(), 
    bankName: z.string().nullable().optional(),
    bankAccount: z.string().nullable().optional(),
    purchaseConfig: z.object({}).passthrough().nullable().optional()
});

export const updateDepartmentSchema = createDepartmentSchema.partial();