import prisma from '../config/prisma.js';

const DriverController = {

    // P0: DRIVER CRUD 

    list: async (req, res) => {
        try {
            const { page = 1, limit = 10, status, search } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const where = {};
            if (status) where.status = status;
            if (search) {
                where.user = { fullName: { contains: search, mode: 'insensitive' } };
            }

            const [drivers, total] = await Promise.all([
                prisma.driver.findMany({
                    where,
                    skip,
                    take: Number(limit),
                    include: {
                        user: { select: { fullName: true, phoneNumber: true, email: true, employeeCode: true, address: true, dob: true, created_at: true } },
                        ratings: {
                            select: {
                                score: true,
                                attitudeScore: true,
                                vehicleQualityScore: true,
                                waitTimeScore: true,
                                comfortScore: true
                            }
                        },
                        _count: {
                            select: {
                                ratings: true,
                                bookings: true
                            }
                        }
                    },
                    orderBy: { id: 'desc' }
                }),
                prisma.driver.count({ where })
            ]);


            const unratedCounts = await prisma.carBooking.groupBy({
                by: ['driverId'],
                where: {
                    userId: req.user?.userId || req.user?.id || 'unauthenticated',
                    status: 'COMPLETED',
                    driverRating: { is: null }
                },
                _count: { id: true }
            });
            const unratedMap = Object.fromEntries(unratedCounts.map(c => [c.driverId, c._count.id]));


            const activeBookings = await prisma.carBooking.findMany({
                where: {
                    driverId: { in: drivers.map(d => d.id) },
                    status: { in: ['ASSIGNED', 'ON_TRIP'] }
                },
                select: { driverId: true }
            });
            const busyDriverIdsMap = new Set(activeBookings.map(b => b.driverId));

            const toSync = drivers.filter(d =>
                (busyDriverIdsMap.has(d.id) && d.status !== 'ON_TRIP' && d.status !== 'OFF_DUTY') ||
                (!busyDriverIdsMap.has(d.id) && d.status === 'ON_TRIP')
            );

            if (toSync.length > 0) {
                await Promise.all(toSync.map(d =>
                    prisma.driver.update({
                        where: { id: d.id },
                        data: { status: busyDriverIdsMap.has(d.id) ? 'ON_TRIP' : 'AVAILABLE' }
                    })
                ));

                toSync.forEach(d => {
                    d.status = busyDriverIdsMap.has(d.id) ? 'ON_TRIP' : 'AVAILABLE';
                });
            }

            const now = new Date();
            const warningThreshold = 30 * 24 * 60 * 60 * 1000;
            const expiredDriverIds = [];

            const enrichedDrivers = drivers.map(d => {
                const expiry = new Date(d.licenseExpiry);
                const diff = expiry - now;
                let warning = null;
                const unratedCount = unratedMap[d.id] || 0;

                const hasCriticalRating = (d.ratings || []).some(r =>
                    (r.score > 0 && r.score <= 2) ||
                    (r.attitudeScore > 0 && r.attitudeScore <= 2) ||
                    (r.vehicleQualityScore > 0 && r.vehicleQualityScore <= 2) ||
                    (r.waitTimeScore > 0 && r.waitTimeScore <= 2) ||
                    (r.comfortScore > 0 && r.comfortScore <= 2)
                );

                if (diff < 0) {
                    warning = "EXPIRED";
                    if (d.status !== 'OFF_DUTY') {
                        d.status = 'OFF_DUTY';
                        expiredDriverIds.push(d.id);
                    }
                }
                else if (diff < warningThreshold) {
                    warning = "EXPIRING_SOON";
                }

                const { ratings, ...driverData } = d;
                return { ...driverData, licenseWarning: warning, unratedCount: unratedCount, hasCriticalRating: hasCriticalRating };
            });

            if (expiredDriverIds.length > 0) {
                prisma.driver.updateMany({
                    where: { id: { in: expiredDriverIds } },
                    data: { status: 'OFF_DUTY' }
                }).catch(err => console.error("Error auto-updating expired drivers:", err));
            }

            res.json({ success: true, data: enrichedDrivers, pagination: { total, page, limit } });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi lấy danh sách tài xế" });
        }
    },

    create: async (req, res) => {
        try {
            const body = req.body;
            const driver = await prisma.driver.create({
                data: {
                    ...body,
                    licenseExpiry: new Date(body.licenseExpiry),
                }
            });
            res.status(201).json({ success: true, data: driver });
        } catch (error) {
            if (error.code === 'P2002') return res.status(400).json({ message: "User này đã là tài xế hoặc số bằng lái bị trùng." });
            res.status(500).json({ message: "Lỗi tạo tài xế" });
        }
    },

    getDetail: async (req, res) => {
        try {
            const { id } = req.params;
            const driver = await prisma.driver.findUnique({
                where: { id: Number(id) },
                include: {
                    user: { select: { fullName: true, avatarUrl: true, phoneNumber: true, email: true, employeeCode: true, address: true, dob: true, created_at: true } },
                    _count: { select: { bookings: true, ratings: true } }
                }
            });
            if (!driver) return res.status(404).json({ message: "Không tìm thấy tài xế" });


            const activeBooking = await prisma.carBooking.findFirst({
                where: {
                    driverId: driver.id,
                    status: { in: ['ASSIGNED', 'ON_TRIP'] }
                }
            });
            const shouldBeBusy = !!activeBooking;
            if (shouldBeBusy && driver.status !== 'ON_TRIP' && driver.status !== 'OFF_DUTY') {
                driver.status = 'ON_TRIP';
                await prisma.driver.update({ where: { id: driver.id }, data: { status: 'ON_TRIP' } });
            } else if (!shouldBeBusy && driver.status === 'ON_TRIP') {
                driver.status = 'AVAILABLE';
                await prisma.driver.update({ where: { id: driver.id }, data: { status: 'AVAILABLE' } });
            }

            const unratedCount = await prisma.carBooking.count({
                where: {
                    driverId: driver.id,
                    userId: req.user?.userId || req.user?.id || 'unauthenticated',
                    status: 'COMPLETED',
                    driverRating: { is: null }
                }
            });

            res.json({ success: true, data: { ...driver, unratedCount } });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy chi tiết" });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const body = req.body;
            const data = { ...body };
            if (body.licenseExpiry) data.licenseExpiry = new Date(body.licenseExpiry);

            const updated = await prisma.driver.update({
                where: { id: Number(id) },
                data
            });
            res.json({ success: true, message: "Cập nhật thành công", data: updated });
        } catch (error) {
            res.status(500).json({ message: "Lỗi cập nhật" });
        }
    },

    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const driverId = Number(id);

            if (isNaN(driverId)) {
                return res.status(400).json({ message: "ID tài xế không hợp lệ." });
            }


            const activeBooking = await prisma.carBooking.findFirst({
                where: {
                    driverId: driverId,
                    status: {
                        in: ['PENDING', 'APPROVED', 'ASSIGNED', 'ON_TRIP']
                    }
                }
            });

            if (activeBooking) {
                const statusVn = {
                    'PENDING': 'Chờ duyệt',
                    'APPROVED': 'Đã duyệt',
                    'ASSIGNED': 'Đã gán tài',
                    'ON_TRIP': 'Đang thực hiện'
                };
                return res.status(400).json({
                    message: "Tài xế đang có chuyến xe không thể xóa!",
                    detail: `Tài xế đang có lịch trình chuyến đi chưa kết thúc (Mã: ${activeBooking.code}, Trạng thái: ${statusVn[activeBooking.status] || activeBooking.status}).`
                });
            }


            await prisma.$transaction([

                prisma.driverRating.deleteMany({ where: { driverId: driverId } }),

                prisma.carBooking.updateMany({
                    where: { driverId: driverId },
                    data: { driverId: null }
                }),

                prisma.driver.delete({ where: { id: driverId } })
            ]);

            res.json({ success: true, message: "Đã xóa bản ghi tài xế thành công." });

        } catch (error) {
            console.error("Delete Driver Error:", error);

            if (error.code === 'P2025') {
                return res.status(404).json({ message: "Không tìm thấy dữ liệu tài xế để xóa." });
            }

            res.status(500).json({
                message: "Lỗi phát sinh khi xóa tài xế!",
                detail: error.message
            });
        }
    },

    // P1: RATING 

    createRating: async (req, res) => {
        try {
            const { bookingId, attitudeScore, vehicleQualityScore, waitTimeScore, comfortScore, comment } = req.body;
            const userId = req.user.userId || req.user.id;

            const booking = await prisma.carBooking.findUnique({
                where: { id: bookingId },
                include: { driverRating: true }
            });

            if (!booking) return res.status(404).json({ message: "Chuyến đi không tồn tại" });
            if (booking.status !== 'COMPLETED') return res.status(400).json({ message: "Chuyến đi chưa hoàn thành." });
            if (booking.userId !== userId) return res.status(403).json({ message: "Bạn không phải người đặt chuyến này." });
            if (booking.driverRating) return res.status(400).json({ message: "Bạn đã đánh giá chuyến đi này rồi." });

            const overallScore = (attitudeScore + vehicleQualityScore + waitTimeScore + comfortScore) / 4;

            await prisma.$transaction(async (tx) => {
                await tx.driverRating.create({
                    data: {
                        bookingId,
                        driverId: booking.driverId,
                        userId,
                        attitudeScore,
                        vehicleQualityScore,
                        waitTimeScore,
                        comfortScore,
                        score: overallScore,
                        comment
                    }
                });

                const aggregator = await tx.driverRating.aggregate({
                    where: { driverId: booking.driverId },
                    _avg: { score: true }
                });

                const newAvg = aggregator._avg.score || 5.0;

                await tx.driver.update({
                    where: { id: booking.driverId },
                    data: { rating: newAvg }
                });
            });

            res.status(201).json({ success: true, message: "Cảm ơn bạn đã gửi đánh giá chi tiết!" });
        } catch (error) {
            console.error("Rating Error:", error);
            res.status(500).json({ message: "Lỗi gửi đánh giá" });
        }
    },

    getDriverRatings: async (req, res) => {
        try {
            const { id } = req.params;
            const { page = 1, limit = 10 } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const [ratings, total] = await Promise.all([
                prisma.driverRating.findMany({
                    where: { driverId: Number(id) },
                    skip,
                    take: Number(limit),
                    orderBy: { createdAt: 'desc' },
                    include: { user: { select: { fullName: true, avatarUrl: true } } }
                }),
                prisma.driverRating.count({ where: { driverId: Number(id) } })
            ]);

            res.json({ success: true, data: ratings, pagination: { total, page, limit } });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy danh sách đánh giá" });
        }
    },

    getRatingSummary: async (req, res) => {
        try {
            const { id } = req.params;

            const avgStats = await prisma.driverRating.aggregate({
                where: { driverId: Number(id) },
                _avg: {
                    score: true,
                    attitudeScore: true,
                    vehicleQualityScore: true,
                    waitTimeScore: true,
                    comfortScore: true
                },
                _count: { id: true }
            });

            const stats = await prisma.driverRating.groupBy({
                by: ['score'],
                where: { driverId: Number(id) },
                _count: { score: true }
            });

            const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            stats.forEach(s => {
                const roundedScore = Math.round(Number(s.score));
                if (distribution[roundedScore] !== undefined) {
                    distribution[roundedScore] += s._count.score;
                }
            });

            res.json({
                success: true,
                data: {
                    totalReviews: avgStats._count.id,
                    overallAverage: Number(avgStats._avg.score || 5).toFixed(1),
                    criteriaAverage: {
                        attitude: Number(avgStats._avg.attitudeScore || 5).toFixed(1),
                        vehicleQuality: Number(avgStats._avg.vehicleQualityScore || 5).toFixed(1),
                        waitTime: Number(avgStats._avg.waitTimeScore || 5).toFixed(1),
                        comfort: Number(avgStats._avg.comfortScore || 5).toFixed(1)
                    },
                    distribution
                }
            });
        } catch (error) {
            res.status(500).json({ message: "Lỗi lấy tóm tắt đánh giá" });
        }
    },

    // P2: REPORT

    getPerformanceReport: async (req, res) => {
        try {
            const { from, to, departmentId } = req.query;

            let dateBookingFilter = undefined;
            let dateRatingFilter = undefined;

            if (from && to) {
                const fromDate = new Date(from);
                fromDate.setHours(0, 0, 0, 0);
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);

                dateBookingFilter = {
                    gte: fromDate,
                    lte: toDate
                };
                dateRatingFilter = {
                    gte: fromDate,
                    lte: toDate
                };
            }

            const where = {};
            if (departmentId && departmentId !== 'ALL') {
                const deptId = Number(departmentId);
                const depts = await prisma.department.findMany({
                    where: {
                        OR: [
                            { id: deptId },
                            { parentId: deptId }
                        ]
                    },
                    select: { id: true }
                });
                const deptIds = depts.map(d => d.id);
                where.user = { departmentId: { in: deptIds } };
            }

            const drivers = await prisma.driver.findMany({
                where,
                select: {
                    id: true,
                    licenseNumber: true,
                    licenseExpiry: true,
                    rating: true,
                    status: true,
                    user: {
                        select: {
                            fullName: true,
                            employeeCode: true,
                            department: { select: { name: true } }
                        }
                    },
                    _count: {
                        select: {
                            ratings: true,
                            bookings: {
                                where: dateBookingFilter ? {
                                    startTime: dateBookingFilter
                                } : undefined
                            }
                        }
                    },
                    ratings: {
                        where: dateRatingFilter ? {
                            createdAt: dateRatingFilter
                        } : undefined,
                        select: {
                            id: true,
                            score: true,
                            attitudeScore: true,
                            vehicleQualityScore: true,
                            waitTimeScore: true,
                            comfortScore: true
                        }
                    }
                },
                orderBy: { rating: 'desc' }
            });


            const unratedCounts = await prisma.carBooking.groupBy({
                by: ['driverId'],
                where: {
                    userId: req.user?.userId || req.user?.id || 'unauthenticated',
                    status: 'COMPLETED',
                    driverRating: { is: null }
                },
                _count: { id: true }
            });
            const unratedMap = Object.fromEntries(unratedCounts.map(c => [c.driverId, c._count.id]));


            let processedDrivers = drivers.map(d => {
                const ratingsList = d.ratings || [];
                const ratingsCount = d._count?.ratings || 0;
                const totalTripsInPeriod = d._count?.bookings || 0;
                const unratedCount = Number(unratedMap[d.id] || 0);

                let computedRating = Number(d.rating) || 0;

                if (from && to) {
                    if (ratingsCount === 0) {
                        computedRating = 0;
                    } else {
                        const sum = ratingsList.reduce((acc, r) => acc + Number(r.score), 0);
                        computedRating = sum / ratingsCount;
                    }
                } else if (ratingsCount === 0 && (!from || !to)) {
                    computedRating = 0;
                }


                const criticalRatings = ratingsList.filter(r =>
                    (r.score > 0 && r.score <= 2) ||
                    (r.attitudeScore > 0 && r.attitudeScore <= 2) ||
                    (r.vehicleQualityScore > 0 && r.vehicleQualityScore <= 2) ||
                    (r.waitTimeScore > 0 && r.waitTimeScore <= 2) ||
                    (r.comfortScore > 0 && r.comfortScore <= 2)
                );
                const criticalRatingIds = criticalRatings.map(r => r.id);
                const hasCriticalRating = criticalRatingIds.length > 0;

                const { ratings, ...driverData } = d;

                return {
                    ...driverData,
                    rating: computedRating,
                    unratedCount: unratedCount,
                    hasCriticalRating: hasCriticalRating,
                    criticalRatingIds: criticalRatingIds,
                    _count: {
                        ...driverData._count,
                        ratings: ratingsCount,
                        bookings: totalTripsInPeriod
                    }
                };
            });

            processedDrivers.sort((a, b) => Number(b.rating) - Number(a.rating));

            const totalRating = processedDrivers.reduce((acc, cur) => acc + Number(cur.rating), 0);
            const teamAvg = processedDrivers.length > 0 ? (totalRating / processedDrivers.length).toFixed(2) : 0;


            const activeBookings = await prisma.carBooking.findMany({
                where: {
                    driverId: { in: drivers.map(d => d.id) },
                    status: { in: ['ASSIGNED', 'ON_TRIP'] }
                },
                select: { driverId: true }
            });
            const busyDriverIdsMap = new Set(activeBookings.map(b => b.driverId));

            const toSync = drivers.filter(d =>
                (busyDriverIdsMap.has(d.id) && d.status !== 'ON_TRIP' && d.status !== 'OFF_DUTY') ||
                (!busyDriverIdsMap.has(d.id) && d.status === 'ON_TRIP')
            );

            if (toSync.length > 0) {
                await Promise.all(toSync.map(d =>
                    prisma.driver.update({
                        where: { id: d.id },
                        data: { status: busyDriverIdsMap.has(d.id) ? 'ON_TRIP' : 'AVAILABLE' }
                    })
                ));
                toSync.forEach(d => {
                    d.status = busyDriverIdsMap.has(d.id) ? 'ON_TRIP' : 'AVAILABLE';
                });
            }

            const now = new Date();
            const expiredDriverIds = [];

            processedDrivers.forEach(d => {
                const expiry = new Date(d.licenseExpiry);
                if (expiry - now < 0 && d.status !== 'OFF_DUTY') {
                    d.status = 'OFF_DUTY';
                    expiredDriverIds.push(d.id);
                }
            });

            if (expiredDriverIds.length > 0) {
                prisma.driver.updateMany({
                    where: { id: { in: expiredDriverIds } },
                    data: { status: 'OFF_DUTY' }
                }).catch(err => console.error("Error auto-updating expired drivers in report:", err));
            }

            const topDrivers = processedDrivers.slice(0, 3);
            const bottomDrivers = processedDrivers.length > 3 ? processedDrivers.slice(-3).reverse() : [];

            res.json({
                success: true,
                data: {
                    teamOverview: {
                        totalDrivers: processedDrivers.length,
                        teamAverageRating: teamAvg
                    },
                    topPerformers: topDrivers,
                    needsImprovement: bottomDrivers,
                    allDrivers: processedDrivers
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi báo cáo hiệu suất" });
        }
    }
};

export default DriverController;