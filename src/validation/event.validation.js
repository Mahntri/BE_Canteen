import { z } from "zod";

export const createEventSchema = z.object({
    name: z.string({ required_error: "Tên sự kiện là bắt buộc" })
           .min(1, "Tên sự kiện không được để trống")
           .trim(),
    
    description: z.string().optional(),
    
    location: z.string().optional(),
    
    // Validate định dạng ngày giờ (ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ)
    startDate: z.string({ required_error: "Thời gian bắt đầu là bắt buộc" })
                .datetime({ message: "Sai định dạng ngày giờ (ISO)" }),
                
    endDate: z.string({ required_error: "Thời gian kết thúc là bắt buộc" })
              .datetime({ message: "Sai định dạng ngày giờ (ISO)" }),
    
    hasMeal: z.boolean().default(false),
    
    // Danh sách user ID được mời (Mảng UUID)
    userIds: z.array(z.string().uuid({ message: "ID người dùng không hợp lệ" }))
              .optional()
              .default([])
}).refine((data) => {
    // Logic: Ngày kết thúc phải sau ngày bắt đầu
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return end > start;
}, {
    message: "Thời gian kết thúc phải diễn ra sau thời gian bắt đầu",
    path: ["endDate"] // Lỗi sẽ hiển thị ở trường endDate
});

export const respondEventSchema = z.object({
    // Chỉ chấp nhận 2 trạng thái này khi user phản hồi
    status: z.enum(["ACCEPTED", "DECLINED"], {
        errorMap: () => ({ message: "Trạng thái phải là ACCEPTED (Tham gia) hoặc DECLINED (Từ chối)" })
    }),
    
    note: z.string().optional()
});