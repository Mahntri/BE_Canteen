import prisma from '../config/prisma.js';

export const checkMeetingConflict = async (startTime, endTime, roomIds, organizerId, excludeBookingId = null) => {
    const start = new Date(startTime);
    const end = new Date(endTime);

    // Những trạng thái này sẽ bị coi là đang "giữ phòng" hoặc "giữ lịch"
    const blockingStatuses = ['CONFIRMED', 'APPROVED'];

    // 1. KIỂM TRA TRÙNG LỊCH CỦA NGƯỜI TỔ CHỨC (Đã bỏ comment)
    const organizerConflict = await prisma.meetingBooking.findFirst({
        where: {
            organizerId,
            status: { in: blockingStatuses },
            startTime: { lte: end },
            endTime: { gte: start },
            ...(excludeBookingId && { id: { not: excludeBookingId } })
        }
    });

    if (organizerConflict) {
        return {
            hasConflict: true,
            type: 'ORGANIZER',
            message: `Bạn đã có lịch họp "${organizerConflict.title}" trong khung giờ này.`,
            priorityScore: organizerConflict.priorityScore || 0
        };
    }

    // 2. KIỂM TRA TRÙNG LỊCH CỦA PHÒNG HỌP (Room)
    if (roomIds && roomIds.length > 0) {
        const roomConflict = await prisma.meetingBookingRoom.findFirst({
            where: {
                roomId: { in: roomIds },
                booking: {
                    status: { in: blockingStatuses },
                    startTime: { lte: end },
                    endTime: { gte: start },
                    ...(excludeBookingId && { id: { not: excludeBookingId } })
                }
            },
            include: {
                booking: {
                    select: {
                        id: true,
                        title: true,
                        priorityScore: true, // QUAN TRỌNG: Lấy điểm ưu tiên của đơn cũ
                        organizerId: true
                    }
                },
                room: { select: { roomName: true } }
            }
        });

        if (roomConflict) {
            return {
                hasConflict: true,
                type: 'ROOM',
                message: `Phòng ${roomConflict.room.roomName} đã được đặt hoặc đang chờ duyệt cho sự kiện "${roomConflict.booking.title}".`,
                conflictBookingId: roomConflict.booking.id,
                existingPriority: roomConflict.booking.priorityScore || 0, // Trả về điểm để Controller so sánh (Logic cướp phòng)
                existingOrganizerId: roomConflict.booking.organizerId
            };
        }
    }

    // An toàn, không trùng lặp
    return { hasConflict: false };
};