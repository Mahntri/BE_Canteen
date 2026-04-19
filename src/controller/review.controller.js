import prisma from '../config/prisma.js';

const ReviewController = {
    create: async (req, res) => {
        try {
            const { rating, comment, dishId, bookingDate, serviceRating, cleanRating, dishReviews } = req.body;
            const userId = req.user?.id || req.user?.userId;

            if (!userId) {
                return res.status(401).json({ message: "Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại." });
            }

            // Lấy orgId chính xác từ database cho user này
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { orgId: true }
            });

            if (!user) {
                return res.status(404).json({ message: "Không tìm thấy thông tin người dùng." });
            }

            const ratingMap = { 'GOOD': 5, 'NORMAL': 3, 'BAD': 1 };
            const userOrgId = user.orgId;
            const targetDate = bookingDate ? new Date(bookingDate) : new Date();
            targetDate.setUTCHours(0, 0, 0, 0);

            // Kiểm tra booking
            const activeBooking = await prisma.bookings.findFirst({
                where: {
                    user_id: userId,
                    status: { in: ['CONFIRMED', 'COMPLETED'] },
                    booking_date: targetDate
                }
            });

            if (!activeBooking) {
                return res.status(403).json({
                    success: false,
                    message: "Bạn không có suất ăn nào hợp lệ trong ngày này để đánh giá."
                });
            }

            // Flag abnormal helper
            const checkAbnormal = (r, s, c) => r <= 2 || (s && s <= 2) || (c && c <= 2);

            // Handle Batch Submission
            if (Array.isArray(dishReviews) && dishReviews.length > 0) {
                // Check if already reviewed general
                const existingReview = await prisma.review.findFirst({
                    where: { userId, bookingDate: targetDate }
                });

                if (existingReview) {
                    return res.status(400).json({ success: false, message: "Bạn đã gửi đánh giá cho ngày này rồi." });
                }

                const parsedRating = parseInt(rating);
                const parsedServiceRating = ratingMap[serviceRating] || (parseInt(serviceRating) || null);
                const parsedCleanRating = ratingMap[cleanRating] || (parseInt(cleanRating) || null);
                const isAbnormal = checkAbnormal(parsedRating, parsedServiceRating, parsedCleanRating);

                const result = await prisma.$transaction(async (tx) => {
                    // 1. Create General Review
                    const mainReview = await tx.review.create({
                        data: {
                            rating: parsedRating,
                            comment: comment || "",
                            orgId: userOrgId,
                            userId: userId,
                            isAbnormal,
                            serviceRating: parsedServiceRating,
                            cleanRating: parsedCleanRating,
                            bookingDate: targetDate
                        }
                    });

                    // 2. Create Dish Reviews
                    const dishReviewPromises = dishReviews.map(dr => {
                        const drRating = parseInt(dr.rating);
                        return tx.dishReview.create({
                            data: {
                                rating: drRating,
                                comment: dr.comment || `Đánh giá món ăn`,
                                orgId: userOrgId,
                                dishId: parseInt(dr.dishId),
                                userId: userId,
                                isAbnormal: drRating <= 2,
                                bookingDate: targetDate
                            }
                        });
                    });

                    await Promise.all(dishReviewPromises);
                    return mainReview;
                });

                return res.status(201).json({
                    success: true,
                    message: "Cảm ơn bạn đã gửi đánh giá chi tiết!",
                    data: result
                });
            }

            // Handle Single Submission (Backward Compatibility)
            const parsedRating = parseInt(rating);
            const parsedDishId = dishId ? parseInt(dishId) : null;
            const parsedServiceRating = ratingMap[serviceRating] || (parseInt(serviceRating) || null);
            const parsedCleanRating = ratingMap[cleanRating] || (parseInt(cleanRating) || null);

            if (isNaN(parsedRating) || !userOrgId) {
                return res.status(400).json({ success: false, message: "Dữ liệu không hợp lệ." });
            }

            const isAbnormal = checkAbnormal(parsedRating, parsedServiceRating, parsedCleanRating);

            let result;
            if (parsedDishId) {
                const existingDishReview = await prisma.dishReview.findFirst({
                    where: { userId, dishId: parsedDishId, bookingDate: targetDate }
                });

                if (existingDishReview) {
                    return res.status(400).json({ success: false, message: "Bạn đã đánh giá món ăn này rồi." });
                }

                result = await prisma.dishReview.create({
                    data: {
                        rating: parsedRating,
                        comment: comment || "",
                        orgId: userOrgId,
                        dishId: parsedDishId,
                        userId: userId,
                        isAbnormal: parsedRating <= 2,
                        bookingDate: targetDate
                    }
                });
            } else {
                const existingReview = await prisma.review.findFirst({
                    where: { userId, bookingDate: targetDate }
                });

                if (existingReview) {
                    return res.status(400).json({ success: false, message: "Bạn đã gửi đánh giá cho ngày này rồi." });
                }

                result = await prisma.review.create({
                    data: {
                        rating: parsedRating,
                        comment: comment || "",
                        orgId: userOrgId,
                        userId: userId,
                        isAbnormal,
                        serviceRating: parsedServiceRating,
                        cleanRating: parsedCleanRating,
                        bookingDate: targetDate
                    }
                });
            }

            return res.status(201).json({
                success: true,
                message: isAbnormal ? "Chúng tôi đã ghi nhận phản hồi của bạn." : "Cảm ơn bạn đã đánh giá!",
                data: result
            });
        } catch (error) {
            console.error("Create Review Error:", error);
            return res.status(500).json({ success: false, message: "Lỗi hệ thống.", error: error.message });
        }
    },

    getStats: async (req, res) => {
        try {
            // Thống kê phân bổ sao (gộp cả 2 bảng)
            const generalDistribution = await prisma.review.groupBy({
                by: ['rating'],
                _count: { id: true }
            });
            const dishDistribution = await prisma.dishReview.groupBy({
                by: ['rating'],
                _count: { id: true }
            });

            const distribution = [1, 2, 3, 4, 5].map(star => {
                const genCount = generalDistribution.find(d => d.rating === star)?._count.id || 0;
                const dishCount = dishDistribution.find(d => d.rating === star)?._count.id || 0;
                return { rating: star, _count: { id: genCount + dishCount } };
            });

            // Lấy 50 đánh giá chung mới nhất
            const latestGeneral = await prisma.review.findMany({
                include: {
                    user: { select: { fullName: true, employeeCode: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: 50
            });

            // Lấy 50 đánh giá món ăn mới nhất
            const latestDish = await prisma.dishReview.findMany({
                include: {
                    user: { select: { fullName: true, employeeCode: true } },
                    dish: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: 50
            });

            const totalGeneral = await prisma.review.count();
            const totalDish = await prisma.dishReview.count();
            const total = totalGeneral + totalDish;

            // Đếm và tìm ID mới nhất cho cảnh báo
            const [abnormalG, abnormalD] = await Promise.all([
                prisma.review.findMany({ where: { isAbnormal: true }, select: { id: true }, orderBy: { id: 'desc' }, take: 1 }),
                prisma.dishReview.findMany({ where: { isAbnormal: true }, select: { id: true }, orderBy: { id: 'desc' }, take: 1 })
            ]);

            const abnormalCountGeneral = await prisma.review.count({ where: { isAbnormal: true } });
            const abnormalCountDish = await prisma.dishReview.count({ where: { isAbnormal: true } });

            const latestId = Math.max(
                abnormalG[0]?.id || 0,
                abnormalD[0]?.id || 0
            );

            // Gộp và sắp xếp theo thời gian
            const alerts = [
                ...latestGeneral.map(r => ({ ...r, type: 'GENERAL' })),
                ...latestDish.map(r => ({ ...r, type: 'DISH' }))
            ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            return res.status(200).json({
                success: true,
                data: {
                    total,
                    distribution,
                    abnormalCount: abnormalCountGeneral + abnormalCountDish,
                    latestAbnormalId: latestId,
                    alerts
                }
            });
        } catch (error) {
            console.error("Dashboard Stats Error:", error);
            return res.status(500).json({ message: "Lỗi hệ thống khi lấy thống kê" });
        }
    },

    getDetail: async (req, res) => {
        try {
            const { id } = req.params;

            // 1. Tìm đánh giá chung
            const review = await prisma.review.findUnique({
                where: { id: parseInt(id) },
                include: {
                    user: { select: { fullName: true, employeeCode: true, id: true } },
                    organization: { select: { name: true } }
                }
            });

            if (!review) {
                return res.status(404).json({ success: false, message: "Không tìm thấy đánh giá." });
            }

            // 2. Tìm các đánh giá món ăn đi kèm (cùng user, cùng ngày)
            const dishReviews = await prisma.dishReview.findMany({
                where: {
                    userId: review.userId,
                    bookingDate: review.bookingDate
                },
                include: {
                    dish: { select: { name: true } }
                }
            });

            return res.status(200).json({
                success: true,
                data: {
                    ...review,
                    dishReviews
                }
            });
        } catch (error) {
            console.error("Get Detail Error:", error);
            return res.status(500).json({ success: false, message: "Lỗi hệ thống." });
        }
    },

    checkStatus: async (req, res) => {
        try {
            const { date } = req.query;
            const userId = req.user?.id || req.user?.userId;

            if (!userId || !date) {
                return res.status(400).json({ success: false, message: "Thiếu thông tin người dùng hoặc ngày." });
            }

            const targetDate = new Date(date);
            targetDate.setUTCHours(0, 0, 0, 0);

            const existingReview = await prisma.review.findFirst({
                where: {
                    userId: userId,
                    bookingDate: targetDate
                }
            });

            return res.status(200).json({
                success: true,
                hasReviewed: !!existingReview
            });
        } catch (error) {
            console.error("Check Status Error:", error);
            return res.status(500).json({ success: false, message: "Lỗi hệ thống." });
        }
    }
};

export default ReviewController;