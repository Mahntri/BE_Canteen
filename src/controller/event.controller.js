import prisma from "../config/prisma.js";
import { createEventSchema, respondEventSchema } from "../validation/event.validation.js";

const EventController = {
    // 1. Tạo sự kiện
    create: async (req, res) => {
        try {
            const orgId = req.user.orgId;
            const creatorId = req.user.id;
            
            const body = createEventSchema.parse(req.body);

            const event = await prisma.event.create({
                data: {
                    orgId,
                    name: body.name,
                    description: body.description,
                    startDate: new Date(body.startDate),
                    endDate: new Date(body.endDate),
                    location: body.location,
                    hasMeal: body.hasMeal,
                    createdBy: creatorId,
                    status: "PLANNED",
                    participants: body.userIds?.length ? {
                        create: body.userIds.map(uid => ({
                            userId: uid,
                            status: "INVITED"
                        }))
                    } : undefined
                },
                include: { participants: true }
            });

            return res.status(201).json({ success: true, data: event });
        } catch (e) {
            if (e.name === 'ZodError') {
                 return res.status(400).json({ success: false, errors: e.errors });
            }
            return res.status(500).json({ message: e.message });
        }
    },

    // 2. Lấy danh sách sự kiện
    list: async (req, res) => {
        try {
            const events = await prisma.event.findMany({
                where: { orgId: req.user.orgId },
                include: {
                    _count: { select: { participants: true } }
                },
                orderBy: { startDate: 'desc' }
            });
            return res.json({ success: true, data: events });
        } catch (e) {
            return res.status(500).json({ message: e.message });
        }
    },

    // 3. User xác nhận tham gia/từ chối
    respond: async (req, res) => {
        try {
            const eventId = Number(req.params.id);
            
            const userId = req.user.userId || req.user.id; 

            if (!userId) {
                return res.status(401).json({ message: "Không tìm thấy thông tin User ID" });
            }

            const body = respondEventSchema.parse(req.body);

            const updated = await prisma.eventParticipant.update({
                where: { 
                    eventId_userId: { 
                        eventId: eventId, 
                        userId: userId 
                    } 
                },
                data: {
                    status: body.status,
                    note: body.note,
                    respondedAt: new Date()
                }
            });

            return res.json({ success: true, data: updated });
        } catch (e) {
            console.error("Respond Event Error:", e);

            if (e.code === 'P2025') {
                 return res.status(404).json({ message: "Bạn không có trong danh sách mời của sự kiện này hoặc sự kiện không tồn tại." });
            }
            if (e.name === 'ZodError') {
                 return res.status(400).json({ success: false, errors: e.errors });
            }
            return res.status(500).json({ message: "Lỗi Server", details: e.message });
        }
    },
    
    // 4. Thống kê tham gia
    stats: async (req, res) => {
        try {
            const eventId = Number(req.params.id);
            const stats = await prisma.eventParticipant.groupBy({
                by: ['status'],
                where: { eventId },
                _count: { userId: true }
            });
            
            const result = {
                INVITED: 0,
                ACCEPTED: 0,
                DECLINED: 0
            };
            stats.forEach(s => result[s.status] = s._count.userId);

            return res.json({ success: true, data: result });
        } catch (e) {
            return res.status(500).json({ message: e.message });
        }
    }
};

export default EventController;