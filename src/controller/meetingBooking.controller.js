import prisma from '../config/prisma.js';
import { checkMeetingConflict } from '../utils/meetingConflict.js';

const MeetingBookingController = {
    // [POST] /meeting-bookings/check-conflict
    checkConflict: async (req, res) => {
        try {
            const { startTime, endTime, roomIds } = req.body;
            const organizerId = req.user.userId || req.user.id;

            if (new Date(endTime) <= new Date(startTime)) {
                return res.status(400).json({ message: "Thời gian kết thúc phải lớn hơn thời gian bắt đầu." });
            }

            const conflict = await checkMeetingConflict(startTime, endTime, roomIds, organizerId);
            res.json({ success: true, data: conflict });
        } catch (error) {
            res.status(500).json({ message: "Lỗi kiểm tra trùng lịch." });
        }
    },

    // [POST] /meeting-bookings
    create: async (req, res) => {
        try {
            const { title, description, startTime, endTime, roomIds, participantCount } = req.body;
            const organizerId = req.body.organizerId || req.user.userId || req.user.id;

            if (new Date(endTime) <= new Date(startTime)) {
                return res.status(400).json({ message: "Thời gian kết thúc phải sau thời gian bắt đầu." });
            }

            if (new Date(startTime) < new Date()) {
                return res.status(400).json({ message: "Không thể đặt phòng trong quá khứ." });
            }

            if (roomIds && roomIds.length > 0 && participantCount) {
                const rooms = await prisma.meetingRoom.findMany({
                    where: { id: { in: roomIds } },
                    select: { capacity: true, roomName: true }
                });

                const totalCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0);

                // if (participantCount > totalCapacity) {
                //     return res.status(400).json({ 
                //         message: `Số người tham gia (${participantCount}) vượt quá tổng sức chứa của các phòng đã chọn (${totalCapacity}).` 
                //     });
                // }
            }

            const conflict = await checkMeetingConflict(startTime, endTime, roomIds, organizerId);
            if (conflict.hasConflict) {
                return res.status(409).json({ message: conflict.message, details: conflict });
            }

            const booking = await prisma.$transaction(async (tx) => {
                const newBooking = await tx.meetingBooking.create({
                    data: {
                        code: `MTG-${Date.now()}`,
                        title,
                        description,
                        startTime: new Date(startTime),
                        endTime: new Date(endTime),
                        organizerId,
                        participantCount: participantCount || 2,
                        status: 'PENDING' // <-- [QUAN TRỌNG] Ép thành PENDING khi tạo
                    }
                });

                if (roomIds && roomIds.length > 0) {
                    const roomData = roomIds.map(roomId => ({ bookingId: newBooking.id, roomId }));
                    await tx.meetingBookingRoom.createMany({ data: roomData });
                }

                // <-- [QUAN TRỌNG] Ghi Log tạo mới
                await tx.bookingAuditLog.create({
                    data: {
                        bookingId: newBooking.id,
                        actorId: organizerId,
                        action: 'CREATE',
                        newStatus: 'PENDING'
                    }
                });

                return newBooking;
            });

            res.status(201).json({ success: true, message: "Đã gửi yêu cầu đặt phòng. Vui lòng chờ duyệt.", data: booking });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi tạo lịch họp.", error: error.message });
        }
    },

    // [PUT] /meeting-bookings/:id
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const { title, description, startTime, endTime, roomIds, participantCount } = req.body;
            const organizerId = req.body.organizerId || req.user.userId || req.user.id;

            const existing = await prisma.meetingBooking.findUnique({ where: { id } });
            if (!existing) return res.status(404).json({ message: "Không tìm thấy lịch họp." });

            if (existing.status === 'CANCELLED' || new Date(existing.endTime) < new Date()) {
                return res.status(403).json({ message: "Không thể sửa lịch họp đã kết thúc hoặc đã hủy." });
            }

            if (new Date(endTime) <= new Date(startTime)) {
                return res.status(400).json({ message: "Thời gian kết thúc phải lớn hơn bắt đầu." });
            }

            const finalParticipantCount = participantCount || existing.participantCount;
            const finalRoomIds = roomIds || [];

            if (finalRoomIds.length > 0) {
                const rooms = await prisma.meetingRoom.findMany({
                    where: { id: { in: finalRoomIds } },
                    select: { capacity: true }
                });
                const totalCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0);

                if (finalParticipantCount > totalCapacity) {
                    return res.status(400).json({
                        message: `Số người tham gia (${finalParticipantCount}) vượt quá tổng sức chứa của các phòng cập nhật (${totalCapacity}).`
                    });
                }
            }

            const conflict = await checkMeetingConflict(startTime, endTime, roomIds, organizerId, id);
            if (conflict.hasConflict) {
                return res.status(409).json({ message: conflict.message, details: conflict });
            }

            const updated = await prisma.$transaction(async (tx) => {
                await tx.meetingBooking.update({
                    where: { id },
                    data: {
                        title,
                        description,
                        startTime: new Date(startTime),
                        endTime: new Date(endTime),
                        participantCount: finalParticipantCount
                    }
                });

                if (roomIds) {
                    await tx.meetingBookingRoom.deleteMany({ where: { bookingId: id } });
                    const roomData = roomIds.map(roomId => ({ bookingId: id, roomId }));
                    await tx.meetingBookingRoom.createMany({ data: roomData });
                }

                return tx.meetingBooking.findUnique({ where: { id }, include: { rooms: { include: { room: true } } } });
            });

            res.json({ success: true, data: updated });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi cập nhật lịch họp." });
        }
    },

    // [POST] /meeting-bookings/:id/cancel
    cancel: async (req, res) => {
        try {
            const { id } = req.params;
            const currentUserId = req.user.userId || req.user.id; // ID từ token người đang thao tác

            const existing = await prisma.meetingBooking.findUnique({ where: { id } });
            
            // Nếu bạn muốn Admin CŨNG KHÔNG ĐƯỢC xóa lịch của người khác:
            if (existing.organizerId !== currentUserId) {
                return res.status(403).json({ 
                    message: "Chỉ người tổ chức cuộc họp mới có quyền hủy lịch này." 
                });
            }

            if (existing.status === 'CANCELLED' || existing.status === 'REJECTED') {
                return res.status(400).json({ message: "Lịch họp này đã được hủy hoặc từ chối trước đó." });
            }

            if (new Date(existing.endTime) < new Date()) {
                return res.status(403).json({ message: "Không thể hủy lịch họp đã diễn ra trong quá khứ." });
            }

            await prisma.meetingBooking.update({
                where: { id },
                data: { status: 'CANCELLED' }
            });

            res.json({ success: true, message: "Đã hủy lịch họp." });
        } catch (error) {
            res.status(500).json({ message: "Lỗi hủy lịch họp." });
        }
    },

    // [GET] /meeting-bookings (List)
    list: async (req, res) => {
        const bookings = await prisma.meetingBooking.findMany({
            include: { rooms: { include: { room: true } }, organizer: { select: { fullName: true } } },
            orderBy: { startTime: 'desc' }
        });
        res.json({ success: true, data: bookings });
    },

    // [GET] /meeting-bookings/:id (Detail)
    getDetail: async (req, res) => {
        const booking = await prisma.meetingBooking.findUnique({
            where: { id: req.params.id },
            include: { rooms: { include: { room: true } }, organizer: { select: { fullName: true, email: true } } }
        });
        if (!booking) return res.status(404).json({ message: "Không tìm thấy" });
        res.json({ success: true, data: booking });
    },

    // --- LOGIC PHÊ DUYỆT BÊN DƯỚI ---

    getPendingApprovals: async (req, res) => {
        try {
            // Lấy danh sách các đơn đang chờ duyệt
            const bookings = await prisma.meetingBooking.findMany({
                where: { status: 'PENDING' },
                include: { rooms: { include: { room: true } }, organizer: { select: { fullName: true } } },
                orderBy: { startTime: 'asc' }
            });
            res.json({ success: true, data: bookings });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy danh sách chờ duyệt." });
        }
    },

    // [PATCH] /meeting-bookings/:id/approve
    approve: async (req, res) => {
        try {
            const { id } = req.params;
            const actorId = req.user.userId || req.user.id;

            const booking = await prisma.meetingBooking.findUnique({ where: { id } });
            if (!booking) return res.status(404).json({ message: "Không tìm thấy lịch họp." });

            if (booking.status !== 'PENDING') {
                return res.status(400).json({ message: "Chỉ có thể duyệt lịch họp đang ở trạng thái chờ (PENDING)." });
            }

            const updated = await prisma.$transaction(async (tx) => {
                const b = await tx.meetingBooking.update({
                    where: { id },
                    data: { status: 'APPROVED' }
                });

                await tx.bookingAuditLog.create({
                    data: {
                        bookingId: id,
                        actorId,
                        action: 'APPROVE',
                        oldStatus: 'PENDING',
                        newStatus: 'APPROVED'
                    }
                });

                return b;
            });

            res.json({ success: true, message: "Đã duyệt lịch họp.", data: updated });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi duyệt lịch họp." });
        }
    },

    // [PATCH] /meeting-bookings/:id/reject
    reject: async (req, res) => {
        try {
            const { id } = req.params;
            const { reason } = req.body || {};
            const actorId = req.user.userId || req.user.id;

            const booking = await prisma.meetingBooking.findUnique({ where: { id } });
            if (!booking) return res.status(404).json({ message: "Không tìm thấy lịch họp." });

            if (booking.status !== 'PENDING') {
                return res.status(400).json({ message: "Chỉ có thể từ chối lịch họp đang ở trạng thái chờ (PENDING)." });
            }

            const updated = await prisma.$transaction(async (tx) => {
                const b = await tx.meetingBooking.update({
                    where: { id },
                    data: { status: 'REJECTED' }
                });

                await tx.bookingAuditLog.create({
                    data: {
                        bookingId: id,
                        actorId,
                        action: 'REJECT',
                        oldStatus: 'PENDING',
                        newStatus: 'REJECTED',
                        ...(reason ? { payload: { reason } } : {})
                    }
                });

                return b;
            });

            res.json({ success: true, message: "Đã từ chối lịch họp.", data: updated });
        } catch (error) {
            console.error("Lỗi từ chối lịch họp:", error);
            res.status(500).json({ message: "Lỗi từ chối lịch họp.", error: error.message });
        }
    },

    getBookingLogs: async (req, res) => {
        try {
            const logs = await prisma.bookingAuditLog.findMany({
                where: { bookingId: req.params.id },
                include: { actor: { select: { fullName: true } } },
                orderBy: { timestamp: 'asc' }
            });
            res.json({ success: true, data: logs });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy lịch sử." });
        }
    },

    getBookingPolicies: async (req, res) => {
        res.json({ success: true, data: [], message: "Chưa có logic lấy chính sách đặt phòng" });
    },

    updateBookingPolicy: async (req, res) => {
        res.json({ success: true, message: `Đã cập nhật chính sách có ID: ${req.params.id}` });
    },
};

export default MeetingBookingController;