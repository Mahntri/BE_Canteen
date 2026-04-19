import prisma from '../config/prisma.js';

const OrgController = {
    _getCurrentUser: async (req) => {
        if (req.user && req.user.userId) return req.user;
        return null;
    },

    // 1. GET /orgs/me
    getMyOrg: async (req, res) => {
        try {
            const orgId = req.user?.orgId;

            if (!orgId) {
                return res.status(404).json({
                    error: { code: "NOT_FOUND", message: "User chưa thuộc tổ chức nào" }
                });
            }

            const org = await prisma.organization.findUnique({
                where: { id: orgId }
            });

            return res.status(200).json({ data: org });

        } catch (error) {
            return res.status(500).json({
                error: { code: "INTERNAL_ERROR", message: error.message }
            });
        }
    },

    // 1b. GET /orgs
    getAllOrgs: async (req, res) => {
        try {
            const orgs = await prisma.organization.findMany();
            return res.status(200).json({ data: orgs });
        } catch (error) {
            return res.status(500).json({
                error: { code: "INTERNAL_ERROR", message: error.message }
            });
        }
    },

    // 2. GET /orgs/:id/settings
    getSettings: async (req, res) => {
        try {
            const orgId = parseInt(req.params.id);

            if (req.user.orgId !== orgId && req.user.role !== 'ADMIN') {
                return res.status(403).json({
                    error: { code: "FORBIDDEN", message: "Không có quyền xem tổ chức khác" }
                });
            }

            let setting = await prisma.organizationSetting.findUnique({
                where: { orgId }
            });

            if (!setting) {
                setting = await prisma.organizationSetting.create({
                    data: { orgId, maxMealPricePerDay: 35000 }
                });
            }

            const responseData = {
                ...setting,
                maxMealPricePerDay: Number(setting.maxMealPricePerDay)
            };
            return res.status(200).json({ data: responseData });

        } catch (error) {
            return res.status(500).json({
                error: { code: "INTERNAL_ERROR", message: error.message }
            });
        }
    },


    // 3. PUT /orgs/:id/settings
    updateSettings: async (req, res) => {
        try {
            const orgId = parseInt(req.params.id);

            if (req.user.orgId !== orgId && req.user.role !== 'ADMIN') {
                return res.status(403).json({
                    error: { code: "FORBIDDEN", message: "Không có quyền cập nhật cấu hình cho tổ chức khác" }
                });
            }
            const {
                maxMealPricePerDay,
                allowedBookingDaysInAdvance,
                canBookingOnWeekend,
                staffBookingDeadlineTime,
                managerBookingDeadlineTime
            } = req.body;

            const data = {};
            if (maxMealPricePerDay !== undefined) data.maxMealPricePerDay = Number(maxMealPricePerDay);
            if (allowedBookingDaysInAdvance !== undefined) data.allowedBookingDaysInAdvance = Number(allowedBookingDaysInAdvance);
            if (canBookingOnWeekend !== undefined) data.canBookingOnWeekend = Boolean(canBookingOnWeekend);
            if (staffBookingDeadlineTime !== undefined) data.staffBookingDeadlineTime = staffBookingDeadlineTime;
            if (managerBookingDeadlineTime !== undefined) data.managerBookingDeadlineTime = managerBookingDeadlineTime;

            const updated = await prisma.organizationSetting.upsert({
                where: { orgId },
                update: data,
                create: { orgId, ...data }
            });

            return res.status(200).json({
                data: {
                    message: "Cập nhật thành công",
                    setting: {
                        ...updated,
                        maxMealPricePerDay: Number(updated.maxMealPricePerDay)
                    }
                }
            });
        } catch (error) {
            return res.status(500).json({
                error: { code: "INTERNAL_ERROR", message: error.message }
            });
        }
    },

    // 4. GET /orgs/:id/shifts
    getShifts: async (req, res) => {
        try {
            const orgId = parseInt(req.params.id);

            if (req.user.orgId !== orgId && req.user.role !== 'ADMIN') {
                return res.status(403).json({
                    error: { code: "FORBIDDEN", message: "Không có quyền truy cập" }
                });
            }

            const shifts = await prisma.shifts.findMany({
                orderBy: { start_time: 'asc' }
            });

            shifts.forEach(s => {
                console.log({
                    id: s.id,
                    name: s.name,
                    end_time: s.end_time
                });
            });

            const response = shifts.map(s => ({
                id: s.id,
                name: s.name,
                startTime: s.start_time,
                endTime: s.end_time,
                bookingDeadline: s.booking_deadline
            }));

            response.forEach(r => {
                console.log({
                    id: r.id,
                    name: r.name,
                    endTime: r.endTime
                });
            });

            return res.status(200).json({ data: response });
        } catch (error) {
            console.error(error);
            return res.status(500).json({
                error: { code: "INTERNAL_ERROR", message: error.message }
            });
        }
    }
    ,


    // 5. PUT /orgs/:id/shifts
    updateShifts: async (req, res) => {
        try {
            const { shifts } = req.body;

            if (!Array.isArray(shifts) || shifts.length === 0) {
                return res.status(400).json({
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "Dữ liệu shifts không hợp lệ"
                    }
                });
            }

            const results = [];

            for (const shift of shifts) {
                const { name, startTime, endTime, bookingDeadline } = shift;

                if (!name || !startTime || !endTime || !bookingDeadline) {
                    return res.status(400).json({
                        error: {
                            code: "VALIDATION_ERROR",
                            message: "Thiếu dữ liệu ca ăn"
                        }
                    });
                }

                // 1. Tìm shift theo name
                const existingShift = await prisma.shifts.findFirst({
                    where: { name }
                });

                if (!existingShift) {
                    return res.status(400).json({
                        error: {
                            code: "NOT_FOUND",
                            message: `Ca ăn '${name}' không tồn tại`
                        }
                    });
                }

                //  2. Update bằng ID
                const updated = await prisma.shifts.update({
                    where: { id: existingShift.id },
                    data: {
                        start_time: new Date(`1970-01-01T${startTime}:00Z`),
                        end_time: new Date(`1970-01-01T${endTime}:00Z`),
                        booking_deadline: new Date(`1970-01-01T${bookingDeadline}:00Z`)
                    }
                });

                results.push(updated);
            }

            return res.status(200).json({
                data: {
                    message: "Cập nhật cấu hình thời gian thành công",
                    shifts: results
                }
            });

        } catch (error) {
            console.error("UPDATE SHIFTS ERROR:", error);
            return res.status(500).json({
                error: {
                    code: "INTERNAL_ERROR",
                    message: error.message
                }
            });
        }
    }
};

export default OrgController;