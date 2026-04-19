import prisma from '../config/prisma.js';

const MeetingRoomController = {
    // 1. Lấy danh sách phòng
    getRooms: async (req, res) => {
        try {
            const orgId = req.user.orgId || 1;
            const { building, floor, minCapacity, search, status } = req.query;

            const where = { orgId, isActive: true };
            
            if (building) where.building = building;
            if (floor) where.floor = Number(floor);
            if (minCapacity) {
                const cap = Number(minCapacity);
                if (cap === 5) where.capacity = { gte: 1, lte: 10 };
                else if (cap === 10) where.capacity = { gte: 11, lte: 20 };
                else if (cap === 20) where.capacity = { gte: 21, lte: 50 };
                else if (cap === 50) where.capacity = { gte: 51 };
                else where.capacity = { gte: cap };
            }
            if (status) where.status = status;
            if (search) {
                where.OR = [
                    { roomName: { contains: search, mode: 'insensitive' } },
                    { roomCode: { contains: search, mode: 'insensitive' } }
                ];
            }

            const rooms = await prisma.meetingRoom.findMany({
                where,
                orderBy: [
                    { building: 'asc' },
                    { floor: 'asc' },
                    { roomName: 'asc' }
                ]
            });

            res.json({ success: true, data: rooms });
        } catch (error) {
            console.error("Lỗi lấy danh sách phòng:", error);
            res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách phòng" });
        }
    },

    // 2. Lấy chi tiết phòng
    getRoomDetail: async (req, res) => {
        try {
            const { id } = req.params;
            const room = await prisma.meetingRoom.findUnique({
                where: { id: parseInt(id) }
            });

            if (!room) return res.status(404).json({ message: "Không tìm thấy phòng họp" });
            res.json({ success: true, data: room });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy chi tiết phòng" });
        }
    },

    // 3. Thêm phòng mới
    createRoom: async (req, res) => {
        try {
            const { roomCode, roomName, capacity, building, floor, location, amenities, status } = req.body;
            const orgId = req.user.orgId || 1;

            if (!roomCode || !roomName) {
                return res.status(400).json({ message: "Mã phòng và Tên phòng là bắt buộc" });
            }

            const existingRoom = await prisma.meetingRoom.findUnique({ where: { roomCode } });
            if (existingRoom) {
                return res.status(400).json({ message: "Mã phòng đã tồn tại" });
            }

            const newRoom = await prisma.meetingRoom.create({
                data: {
                    orgId,
                    roomCode,
                    roomName,
                    capacity: capacity ? Number(capacity) : 10,
                    building,
                    floor: floor ? Number(floor) : null,
                    location,
                    amenities: amenities || [],
                    status: status || 'AVAILABLE'
                }
            });

            res.status(201).json({ success: true, message: "Tạo phòng thành công", data: newRoom });
        } catch (error) {
            console.error("Lỗi tạo phòng:", error);
            res.status(500).json({ message: "Lỗi khi tạo phòng họp" });
        }
    },

    // 4. Cập nhật phòng
    updateRoom: async (req, res) => {
        try {
            const { id } = req.params;
            const { roomName, capacity, building, floor, location, amenities, status } = req.body;

            const roomExists = await prisma.meetingRoom.findUnique({ where: { id: parseInt(id) } });
            if (!roomExists) return res.status(404).json({ message: "Không tìm thấy phòng họp" });

            const updatedRoom = await prisma.meetingRoom.update({
                where: { id: parseInt(id) },
                data: {
                    roomName: roomName !== undefined ? roomName : undefined,
                    capacity: (capacity !== undefined && capacity !== null && capacity !== "") ? Number(capacity) : undefined,
                    building: building !== undefined ? building : undefined,
                    floor: floor !== undefined ? Number(floor) : undefined,
                    location: location !== undefined ? location : undefined,
                    amenities: amenities !== undefined ? amenities : undefined,
                    status: status !== undefined ? status : undefined
                }
            });

            res.json({ success: true, message: "Cập nhật thành công", data: updatedRoom });
        } catch (error) {
            console.error("Lỗi cập nhật phòng:", error);
            res.status(500).json({ message: "Lỗi khi cập nhật phòng họp" });
        }
    },

    // 5. Xóa phòng 
    deleteRoom: async (req, res) => {
        try {
            const { id } = req.params;

            const roomExists = await prisma.meetingRoom.findUnique({ where: { id: parseInt(id) } });
            if (!roomExists) return res.status(404).json({ message: "Không tìm thấy phòng họp" });

            await prisma.meetingRoom.update({
                where: { id: parseInt(id) },
                data: { isActive: false }
            });

            res.json({ success: true, message: "Đã ngưng hoạt động phòng này" });
        } catch (error) {
            res.status(500).json({ message: "Lỗi khi xóa phòng họp" });
        }
    },

    // 6. Toggle active status (kích hoạt / ngưng hoạt động)
    toggleActive: async (req, res) => {
        try {
            const { id } = req.params;

            const room = await prisma.meetingRoom.findUnique({ where: { id: parseInt(id) } });
            if (!room) return res.status(404).json({ message: "Không tìm thấy phòng họp" });

            // Nếu đang INACTIVE thì kích hoạt lại AVAILABLE, còn lại thì ngưng hoạt động (INACTIVE)
            const newStatus = room.status === 'INACTIVE' ? 'AVAILABLE' : 'INACTIVE';

            const updatedRoom = await prisma.meetingRoom.update({
                where: { id: parseInt(id) },
                data: { status: newStatus }
            });

            res.json({
                success: true,
                message: newStatus === 'AVAILABLE' ? "Kích hoạt thành công" : "Ngưng hoạt động thành công",
                data: updatedRoom
            });
        } catch (error) {
            console.error("Lỗi toggle hoạt động:", error);
            res.status(500).json({ message: "Lỗi khi thay đổi trạng thái hoạt động" });
        }
    }
};

export default MeetingRoomController;