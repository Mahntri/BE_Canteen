import prisma from '../config/prisma.js';
import { checkConflict } from '../utils/carConflict.js';
import pkg from 'json2csv';
const { Parser } = pkg;

const CarBookingController = {

    createBooking: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const {
                title, leaderName, startTime, endTime,
                startLocation, endLocation, passengerCount,
                note, priority, stops,
                vehicleId, driverId 
            } = req.body;

            if (new Date(endTime) <= new Date(startTime)) {
                return res.status(400).json({ message: "Thời gian kết thúc phải sau thời gian bắt đầu." });
            }

            const booking = await prisma.carBooking.create({
                data: {
                    userId,
                    orgId: req.user.orgId || 1,
                    code: `CAR-${Date.now()}`,
                    title,
                    leaderName,
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                    startLocation,
                    endLocation,
                    passengerCount: Number(passengerCount),
                    note,
                    priority: priority || 'NORMAL',
                    status: 'PENDING', 
                    vehicleId: vehicleId ? Number(vehicleId) : null,
                    driverId: driverId ? Number(driverId) : null,
                    stops: {
                        create: (Array.isArray(stops) ? stops : []).map((stop, index) => ({
                            address: stop.address || stop,
                            order: index + 1,
                            note: stop.note || ""
                        }))
                    },
                    logs: {
                        create: {
                            actorId: userId,
                            action: 'CREATE',
                            detail: (vehicleId && driverId) ? 'Tạo yêu cầu và đề xuất xe/tài xế' : 'Tạo yêu cầu đặt xe mới'
                        }
                    }
                },
                include: { stops: true }
            });

            res.status(201).json({ success: true, data: booking });
        } catch (error) {
            console.error("Create Booking Error:", error);
            res.status(500).json({ message: "Lỗi tạo đặt xe" });
        }
    },

   updateBooking: async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.userId || req.user.id;
            const userRole = req.user.role?.name || req.user.role || 'EMPLOYEE'; 
            
            const { title, startTime, endTime, startLocation, endLocation, passengerCount, note, priority, stops, vehicleId, driverId } = req.body;

            const booking = await prisma.carBooking.findUnique({ where: { id } });

            if (!booking) return res.status(404).json({ message: "Không tìm thấy đơn đặt xe" });
            
            if (!['ADMIN', 'SUPERVISOR', 'DISPATCHER', 'CANTEEN', 'DRIVER'].includes(userRole) && booking.userId !== userId) {
                return res.status(403).json({ message: "Bạn không có quyền sửa đơn này" });
            }
            
            if (booking.status !== 'PENDING') return res.status(400).json({ message: "Chỉ có thể sửa đơn ở trạng thái CHỜ DUYỆT" });

            const updated = await prisma.$transaction(async (tx) => {
                if (stops && Array.isArray(stops)) {
                    await tx.carBookingStop.deleteMany({ where: { bookingId: id } });
                }

                return tx.carBooking.update({
                    where: { id },
                    data: {
                        title,
                        startTime: startTime ? new Date(startTime) : undefined,
                        endTime: endTime ? new Date(endTime) : undefined,
                        priority,
                        startLocation,
                        endLocation,
                        passengerCount: passengerCount ? Number(passengerCount) : undefined,
                        note,
                        vehicleId: vehicleId !== undefined ? (vehicleId ? Number(vehicleId) : null) : undefined,
                        driverId: driverId !== undefined ? (driverId ? Number(driverId) : null) : undefined,
                        stops: stops ? {
                            create: stops.map((stop, index) => ({
                                address: stop.address,
                                order: index + 1,
                                note: stop.note
                            }))
                        } : undefined
                    },
                    include: { stops: true }
                });
            });

            res.json({ success: true, data: updated });
        } catch (error) {
            console.error("Update Booking Error:", error);
            res.status(500).json({ message: "Lỗi cập nhật đơn xe" });
        }
    },

    getMyBookings: async (req, res) => {
        try {
            const { status, page = 1, limit = 10 } = req.query;
            const skip = (Number(page) - 1) * Number(limit);
            
            const userId = req.user.userId || req.user.id;

            const where = { userId: userId };
            
            if (status) where.status = status;

            const [data, total] = await Promise.all([
                prisma.carBooking.findMany({
                    where,
                    skip,
                    take: Number(limit),
                    orderBy: { createdAt: 'desc' },
                    include: {
                        creator: { select: { fullName: true, employeeCode: true } },
                        vehicle: true,
                        driver: { include: { user: { select: { fullName: true, phoneNumber: true } } } },
                        driverRating: true
                    }
                }),
                prisma.carBooking.count({ where })
            ]);

            res.json({ success: true, data, pagination: { total, page, limit } });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy danh sách cá nhân" });
        }
    },

    cancelBooking: async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.userId || req.user.id;

            const booking = await prisma.carBooking.findUnique({ where: { id } });
            if (!booking) return res.status(404).json({ message: "Đơn không tồn tại" });
            if (booking.userId !== userId) return res.status(403).json({ message: "Bạn không có quyền hủy đơn này" });

            await prisma.$transaction(async (tx) => {
                await tx.carBooking.update({
                    where: { id },
                    data: { status: 'CANCELLED' }
                });
                await tx.carBookingLog.create({
                    data: { bookingId: id, actorId: userId, action: 'CANCEL', detail: 'Người dùng chủ động hủy đơn' }
                });
            });

            res.json({ success: true, message: "Đã hủy đơn đặt xe thành công." });
        } catch (error) {
            res.status(500).json({ message: "Lỗi hủy đơn xe" });
        }
    },

    completeBooking: async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.userId || req.user.id;

            const booking = await prisma.carBooking.findUnique({ where: { id } });
            if (!booking) return res.status(404).json({ message: "Đơn không tồn tại" });
            
            if (!['ASSIGNED', 'ON_TRIP'].includes(booking.status)) {
                return res.status(400).json({ message: "Chỉ có thể hoàn thành đơn xe đã được điều phối." });
            }

            const now = new Date();
            const endTime = new Date(booking.endTime);
            if (now < endTime) {
                return res.status(400).json({ message: "Chuyến đi chưa kết thúc thời gian dự kiến, không thể hoàn thành." });
            }

            await prisma.$transaction(async (tx) => {
                await tx.carBooking.update({
                    where: { id },
                    data: { status: 'COMPLETED' }
                });
                await tx.carBookingLog.create({
                    data: { bookingId: id, actorId: userId, action: 'COMPLETE', detail: 'Xác nhận hoàn thành chuyến xe' }
                });
            });

            res.json({ success: true, message: "Đã xác nhận hoàn thành chuyến xe." });
        } catch (error) {
            res.status(500).json({ message: "Lỗi cập nhật trạng thái hoàn thành" });
        }
    },

    getBookings: async (req, res) => {
        try {
            const { status, page = 1, limit = 10 } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const where = {};
            if (status) where.status = status;

            const userRole = req.user.role?.name || req.user.role || 'EMPLOYEE';
            if (!['ADMIN', 'SUPERVISOR', 'DISPATCHER'].includes(userRole)) {
                where.userId = req.user.userId || req.user.id;
            }

            const [data, total] = await Promise.all([
                prisma.carBooking.findMany({
                    where,
                    skip,
                    take: Number(limit),
                    orderBy: { createdAt: 'desc' },
                    include: {
                        creator: { select: { fullName: true, employeeCode: true } },
                        vehicle: true,
                        driver: { include: { user: { select: { fullName: true, phoneNumber: true } } } },
                        driverRating: true
                    }
                }),
                prisma.carBooking.count({ where })
            ]);

            res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy danh sách" });
        }
    },

    getBookingDetail: async (req, res) => {
        try {
            const { id } = req.params;
            const booking = await prisma.carBooking.findUnique({
                where: { id },
                include: { 
                    creator: { select: { fullName: true, employeeCode: true, phoneNumber: true } }, 
                    vehicle: true, 
                    driver: { include: { user: { select: { fullName: true, phoneNumber: true } } } }, 
                    stops: { orderBy: { order: 'asc' } }, 
                    driverRating: true,
                    // Lấy Logs chi tiết
                    logs: { 
                        orderBy: { timestamp: 'desc' }, 
                        include: { actor: { select: { fullName: true, role: { select: { name: true } } } } } 
                    }
                }
            });
            
            if (!booking) return res.status(404).json({ message: "Không tìm thấy đơn xe" });

            const userRole = req.user.role?.name || req.user.role || 'EMPLOYEE';
            const userId = req.user.userId || req.user.id;
            
            if (!['ADMIN', 'SUPERVISOR', 'DISPATCHER'].includes(userRole) && booking.userId !== userId) {
                return res.status(403).json({ message: "Bạn không có quyền xem chi tiết đơn này." });
            }

            res.json({ success: true, data: booking });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy chi tiết đơn" });
        }
    },

    approveBooking: async (req, res) => {
        try {
            const { id } = req.params;
            const actorId = req.user.userId || req.user.id;

            const booking = await prisma.carBooking.findUnique({ where: { id } });
            if (!booking) return res.status(404).json({ message: "Không tìm thấy đơn đặt xe" });
            
            const newStatus = (booking.vehicleId && booking.driverId) ? 'ASSIGNED' : 'APPROVED';

            await prisma.$transaction(async (tx) => {
                await tx.carBooking.update({
                    where: { id },
                    data: { status: newStatus }
                });
                await tx.carBookingLog.create({
                    data: { 
                        bookingId: id, 
                        actorId, 
                        action: 'APPROVE', 
                        detail: newStatus === 'ASSIGNED' ? 'Đã duyệt yêu cầu và xác nhận phân xe' : 'Đã duyệt yêu cầu, chờ điều xe' 
                    }
                });
            });

            res.json({ success: true, message: "Đã duyệt đơn xe." });
        } catch (error) {
            res.status(500).json({ message: "Lỗi duyệt đơn" });
        }
    },

    rejectBooking: async (req, res) => {
        try {
            const { id } = req.params;
            const actorId = req.user.userId || req.user.id;
            const { reason } = req.body;

            const booking = await prisma.carBooking.findUnique({ where: { id } });
            if (!booking) return res.status(404).json({ message: "Không tìm thấy đơn đặt xe" });
            if (!['PENDING', 'APPROVED'].includes(booking.status)) {
                return res.status(400).json({ message: "Chỉ có thể từ chối đơn ở trạng thái CHỜ DUYỆT hoặc ĐÃ DUYỆT" });
            }

            await prisma.$transaction(async (tx) => {
                await tx.carBooking.update({
                    where: { id },
                    data: { status: 'REJECTED', rejectionReason: reason }
                });
                await tx.carBookingLog.create({
                    data: {
                        bookingId: id,
                        actorId,
                        action: 'REJECT',
                        detail: reason ? `Từ chối: ${reason}` : 'Đã từ chối yêu cầu'
                    }
                });
            });

            res.json({ success: true, message: "Đã từ chối yêu cầu." });
        } catch (error) {
            res.status(500).json({ message: "Lỗi từ chối đơn" });
        }
    },

    assignResources: async (req, res) => {
        try {
            const { id } = req.params;
            const { vehicleId, driverId } = req.body;
            const actorId = req.user.userId || req.user.id;

            const booking = await prisma.carBooking.findUnique({ where: { id } });
            if (!booking) return res.status(404).json({ message: "Không tìm thấy đơn" });

            const conflict = await checkConflict(booking.startTime, booking.endTime, vehicleId, driverId, id);
            if (conflict) {
                let msg = "Xảy ra trùng lịch!";
                if (conflict.vehicleId === vehicleId) msg = `Xe ${conflict.vehicle.plateNumber} đang bận ở đơn ${conflict.code}`;
                if (conflict.driverId === driverId) msg = `Tài xế đang bận ở đơn ${conflict.code}`;
                return res.status(409).json({ message: msg, conflictBooking: conflict });
            }

            const [vehicle, driver] = await Promise.all([
                prisma.vehicle.findUnique({ where: { id: vehicleId } }),
                prisma.driver.findUnique({ where: { id: driverId } })
            ]);

            if (vehicle.status === 'MAINTENANCE' || vehicle.status === 'UNAVAILABLE') {
                return res.status(400).json({ message: "Xe này đang bảo dưỡng hoặc ngừng hoạt động." });
            }
            if (driver.status === 'OFF_DUTY') {
                return res.status(400).json({ message: "Tài xế đang nghỉ phép." });
            }

            await prisma.$transaction(async (tx) => {
                await tx.carBooking.update({
                    where: { id },
                    data: { vehicleId, driverId, status: 'ASSIGNED' }
                });

                await tx.carBookingLog.create({
                    data: {
                        bookingId: id,
                        actorId,
                        action: 'ASSIGN',
                        detail: `Phân xe: ${vehicle.plateNumber}, Tài xế: ${driverId}`
                    }
                });
            });

            res.json({ success: true, message: "Điều phối thành công!" });
        } catch (error) {
            res.status(500).json({ message: "Lỗi điều phối" });
        }
    },

    reportIncident: async (req, res) => {
        try {
            const { id } = req.params;
            const { reason, markVehicleUnavailable } = req.body;
            const actorId = req.user.userId || req.user.id;

            await prisma.$transaction(async (tx) => {
                const booking = await tx.carBooking.update({
                    where: { id },
                    data: {
                        status: 'INCIDENT',
                        incidentDetail: reason
                    }
                });

                if (markVehicleUnavailable && booking.vehicleId) {
                    await tx.vehicle.update({
                        where: { id: booking.vehicleId },
                        data: { status: 'UNAVAILABLE' }
                    });
                }

                await tx.carBookingLog.create({
                    data: { bookingId: id, actorId, action: 'INCIDENT', detail: `Sự cố: ${reason}` }
                });
            });

            res.json({ success: true, message: "Đã ghi nhận sự cố." });
        } catch (error) {
            console.error("Incident Error:", error);
            res.status(500).json({ message: "Lỗi báo cáo sự cố" });
        }
    },

    getVehicleSchedule: async (req, res) => {
        try {
            const { id } = req.params;
            const { from, to } = req.query;

            const start = new Date(from);
            start.setHours(0, 0, 0, 0);
            const end = new Date(to || from);
            end.setHours(23, 59, 59, 999);

            const schedule = await prisma.carBooking.findMany({
                where: {
                    vehicleId: parseInt(id),
                    status: { in: ['ASSIGNED', 'ON_TRIP', 'APPROVED', 'COMPLETED'] },
                    startTime: { gte: start },
                    endTime: { lte: end }
                },
                include: { creator: { select: { fullName: true } } },
                orderBy: { startTime: 'asc' }
            });
            res.json({ success: true, data: schedule });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy lịch xe" });
        }
    },

    getDriverSchedule: async (req, res) => {
        try {
            const { id } = req.params;
            const { from, to } = req.query;

            const start = new Date(from);
            start.setHours(0, 0, 0, 0);
            const end = new Date(to || from);
            end.setHours(23, 59, 59, 999);

            const schedule = await prisma.carBooking.findMany({
                where: {
                    driverId: parseInt(id),
                    status: { in: ['ASSIGNED', 'ON_TRIP', 'APPROVED', 'COMPLETED'] },
                    startTime: { gte: start },
                    endTime: { lte: end }
                },
                include: { creator: { select: { fullName: true } } },
                orderBy: { startTime: 'asc' }
            });
            res.json({ success: true, data: schedule });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy lịch tài xế" });
        }
    },

    getReports: async (req, res) => {
        try {
            const { from, to } = req.query;
            const where = {};
            if (from && to) {
                where.startTime = { gte: new Date(from), lte: new Date(to) };
            }

            const [totalTrips, statusCounts, vehicleStats] = await Promise.all([
                prisma.carBooking.count({ where }),
                prisma.carBooking.groupBy({
                    by: ['status'],
                    _count: { id: true },
                    where
                }),
                prisma.carBooking.groupBy({
                    by: ['vehicleId'],
                    _count: { id: true },
                    where: { ...where, status: 'COMPLETED', vehicleId: { not: null } }
                })
            ]);

            res.json({
                success: true,
                data: { totalTrips, byStatus: statusCounts, topVehicles: vehicleStats }
            });
        } catch (error) {
            res.status(500).json({ message: "Lỗi báo cáo" });
        }
    },

    getAvailableResources: async (req, res) => {
        try {
            const { startTime, endTime, excludeId } = req.query;

            if (!startTime || !endTime) {
                return res.status(400).json({ message: "Thiếu startTime hoặc endTime" });
            }

            const start = new Date(startTime);
            const end = new Date(endTime);

            const conflictingBookings = await prisma.carBooking.findMany({
                where: {
                    status: { in: ['ASSIGNED', 'ON_TRIP', 'APPROVED','PENDING'] },
                    startTime: { lt: end },
                    endTime: { gt: start },
                    ...(excludeId && { id: { not: excludeId } }),
                    OR: [
                        { vehicleId: { not: null } },
                        { driverId: { not: null } }
                    ]
                },
                select: { vehicleId: true, driverId: true }
            });

            const busyVehicleIds = [...new Set(conflictingBookings.map(b => b.vehicleId).filter(id => id !== null))];
            const busyDriverIds = [...new Set(conflictingBookings.map(b => b.driverId).filter(id => id !== null))];

            return res.json({ success: true, busyVehicleIds, busyDriverIds });
        } catch (error) {
            console.error('getAvailableResources error:', error);
            return res.status(500).json({ message: "Lỗi kiểm tra lịch xe" });
        }
    },

    exportMyHistory: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const { from, to } = req.query;

            const bookings = await prisma.carBooking.findMany({
                where: {
                    userId,
                    ...(from || to ? { startTime: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {})
                },
                include: {
                    vehicle: true,
                    driver: { include: { user: true } },
                    stops: { orderBy: { order: 'asc' } },
                    driverRating: true
                },
                orderBy: { startTime: 'desc' }
            });

            if (bookings.length === 0) return res.status(404).json({ message: "Không có dữ liệu." });

            const csvData = bookings.map(b => ({
                "Mã đơn": b.code,
                "Tiêu đề": b.title,
                "Thời gian đi": b.startTime.toLocaleString('vi-VN'),
                "Thời gian về": b.endTime.toLocaleString('vi-VN'),
                "Điểm đi": b.startLocation,
                "Điểm đến": b.endLocation,
                "Lộ trình": b.stops.map(s => s.address).join(' -> '),
                "Trạng thái": b.status,
                "Xe": b.vehicle?.plateNumber || "",
                "Tài xế": b.driver?.user?.fullName || ""
            }));

            const json2csvParser = new Parser({ withBOM: true, delimiter: ';' });
            const csv = json2csvParser.parse(csvData);

            res.header('Content-Type', 'text/csv; charset=utf-8');
            res.attachment(`Lich_su_xe_${Date.now()}.csv`);
            return res.send(csv);
        } catch (error) {
            res.status(500).json({ message: "Lỗi xuất file" });
        }
    }
};

export default CarBookingController;