import prisma from '../config/prisma.js';

/**
 * Hàm ghi nhật ký thay đổi cho hệ thống đặt phòng/xe
 * @param {Object} params 
 * @param {string} params.bookingId 
 * @param {string} params.actorId 
 * @param {string} params.action 
 * @param {string} [params.oldStatus] 
 * @param {string} [params.newStatus] 
 * @param {Object} [params.payload] 
 */
export const createAuditLog = async ({
    bookingId,
    actorId,
    action,
    oldStatus,
    newStatus,
    payload = {}
}) => {
    try {
        await prisma.bookingAuditLog.create({
            data: {
                bookingId,
                actorId,
                action,
                oldStatus,
                newStatus,
                payload // Prisma sẽ tự động lưu Object này thành JsonB trong Postgres
            }
        });
    } catch (error) {
        // Chỉ log lỗi ra console để không làm gián đoạn luồng chính của User
        console.error("Critical: Failed to create Audit Log:", error);
    }
};