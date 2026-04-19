import { z } from "zod";

export const validate = (schema) => (req, res, next) => {
    try {
        if (!req.body) {
            return res.status(500).json({ success: false, message: "Req.body is missing" });
        }

        const validatedData = schema.parse(req.body);
        req.body = validatedData;
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.log(">>> ZOD ERROR RAW:", JSON.stringify(error.issues, null, 2));
        } else {
            console.error(">>> UNKNOWN ERROR:", error);
        }

        if (error instanceof z.ZodError) {
            const issues = error.issues || [];
            
            if (issues.length > 0) {
                const errorMessages = issues.map((issue) => {
                    const path = issue.path.join('.') || 'root';
                    return `${path}: ${issue.message}`;
                }).join(", ");

                return res.status(400).json({
                    success: false,
                    message: "Dữ liệu không hợp lệ",
                    details: errorMessages
                });
            }

            const formatted = error.format();
            return res.status(400).json({
                success: false,
                message: "Dữ liệu không hợp lệ",
                details: JSON.stringify(formatted)
            });
        }

        return res.status(500).json({ success: false, message: "Lỗi Validation Server" });
    }
};