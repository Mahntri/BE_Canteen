import { z } from "zod";

const toNumber = (val) => {
    if (val === undefined || val === "") return undefined;
    if (val === null) return null;
    const num = Number(val);
    return isNaN(num) ? val : num;
};

export const createWarehouseSchema = z.object({
    code: z.string({ required_error: "Mã kho là bắt buộc" }).min(1).trim(),
    name: z.string({ required_error: "Tên kho là bắt buộc" }).min(1).trim(),
    
    location: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    
    area: z.preprocess(toNumber, z.number().min(0).nullable().optional()),
    capacity: z.preprocess(toNumber, z.number().int().min(0).nullable().optional()),
    
    managerName: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    
    status: z.enum(["active", "inactive", "maintenance"], {
        errorMap: () => ({ message: "Trạng thái phải là: active, inactive hoặc maintenance" })
    }).default("active"),
    
    type: z.enum(["AMBIENT", "CHILLED", "FROZEN", "NON_FOOD"]).default("AMBIENT"),
    departmentId: z.preprocess(toNumber, z.number().int().nullable().optional()),
    accountantId: z.string().uuid().nullable().optional(),
});

export const updateWarehouseSchema = z.object({
    code: z.string().min(1).trim().optional(),
    name: z.string().min(1).trim().optional(),
    location: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    
    area: z.preprocess(toNumber, z.number().min(0).nullable().optional()),
    capacity: z.preprocess(toNumber, z.number().int().min(0).nullable().optional()),
    
    managerName: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    
    status: z.enum(["active", "inactive", "maintenance"]).optional(),
    
    type: z.enum(["AMBIENT", "CHILLED", "FROZEN", "NON_FOOD"]).optional(),
    departmentId: z.preprocess(toNumber, z.number().int().nullable().optional()),
    accountantId: z.string().uuid().nullable().optional(),
});