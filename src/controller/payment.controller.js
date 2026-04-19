import QRCode from 'qrcode';
import prisma from '../config/prisma.js';
import { normalizeTransactions } from '../utils/normalizeTransaction.js';

// Debt limit constant (500,000 VND)
const DEBT_LIMIT = 500000;

const PaymentController = {

    getWalletInfo: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const wallet = await prisma.wallets.findUnique({
                where: { user_id: userId },
                include: { transactions: { take: 5, orderBy: { created_at: 'desc' } } }
            });

            if (!wallet) return res.status(404).json({ message: "Tài khoản chưa kích hoạt" });

            // Calculate current debt from unpaid bookings
            const unpaidBookings = await prisma.bookings.findMany({
                where: {
                    user_id: userId,
                    status: { in: ['CONFIRMED', 'COMPLETED'] },
                    isPaid: false,
                    OR: [
                        { transaction_id: null },
                        {
                            transaction: { status: { in: ['FAILED', 'CANCELLED'] } }
                        }
                    ]
                }
            });

            const currentDebt = unpaidBookings.reduce((sum, booking) => {
                return sum + Number(booking.amount || 0);
            }, 0);

            return res.json({
                success: true,
                data: {
                    balance: Number(wallet.balance || 0),
                    debtAmount: currentDebt,
                    maxDebtLimit: DEBT_LIMIT,
                    isLocked: wallet.is_locked || false,
                    recentTransactions: normalizeTransactions ? normalizeTransactions(wallet.transactions) : wallet.transactions
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi server" });
        }
    },

    // 2. Lấy lịch sử giao dịch 
    getMyTransactions: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const { page = 1, limit = 10, type, status } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const where = {
                wallet_id: userId,
                ...(type ? { transaction_type: type } : {}),
                ...(status ? { status: status } : {})
            };

            const [transactions, total] = await Promise.all([
                prisma.transactions.findMany({
                    where,
                    skip,
                    take: Number(limit),
                    orderBy: { created_at: 'desc' }
                }),
                prisma.transactions.count({ where })
            ]);

            return res.json({
                success: true,
                data: normalizeTransactions ? normalizeTransactions(transactions) : transactions,
                pagination: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages: Math.ceil(total / Number(limit))
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi lấy lịch sử giao dịch" });
        }
    },

    // 3. Lấy danh sách nợ
    getUnpaidBookings: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const { mode, date, month, year } = req.query;

            // Build where condition with date filters
            const where = {
                user_id: userId,
                status: { in: ['CONFIRMED', 'COMPLETED'] },
                isPaid: false,
                OR: [
                    { transaction_id: null },
                    {
                        transaction: { status: { in: ['FAILED', 'CANCELLED'] } }
                    }
                ]
            };

            // Add date filtering based on mode
            if (mode === 'day' && date) {
                // Filter by specific date (YYYY-MM-DD)
                const startDate = new Date(date);
                startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(date);
                endDate.setHours(23, 59, 59, 999);

                where.booking_date = {
                    gte: startDate,
                    lte: endDate
                };
            } else if (mode === 'month' && month && year) {
                // Filter by month and year
                const startDate = new Date(year, month - 1, 1);
                const endDate = new Date(year, month, 0, 23, 59, 59, 999);

                where.booking_date = {
                    gte: startDate,
                    lte: endDate
                };
            } else if (mode === 'year' && year) {
                // Filter by year
                const startDate = new Date(year, 0, 1);
                const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

                where.booking_date = {
                    gte: startDate,
                    lte: endDate
                };
            }

            const unpaidBookings = await prisma.bookings.findMany({
                where,
                orderBy: { booking_date: 'asc' },
                include: {
                    shifts: { select: { name: true, start_time: true, end_time: true } },
                    booking_items: { include: { dishes: { select: { name: true } } } }
                }
            });

            // Calculate current debt from all unpaid bookings (without filter)
            const allUnpaidBookings = await prisma.bookings.findMany({
                where: {
                    user_id: userId,
                    status: { in: ['CONFIRMED', 'COMPLETED'] },
                    isPaid: false,
                    OR: [
                        { transaction_id: null },
                        {
                            transaction: { status: { in: ['FAILED', 'CANCELLED'] } }
                        }
                    ]
                }
            });

            const currentDebt = allUnpaidBookings.reduce((sum, booking) => {
                return sum + Number(booking.amount || 0);
            }, 0);

            return res.json({
                success: true,
                data: unpaidBookings,
                debtInfo: {
                    debtLimit: DEBT_LIMIT,
                    currentDebt: currentDebt
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi lấy danh sách nợ" });
        }
    },

    // 4. Tạo yêu cầu thanh toán -> Sinh QR
    createPaymentRequest: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const { bookingIds } = req.body;

            if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
                return res.status(400).json({ message: "Vui lòng chọn ít nhất 1 đơn hàng." });
            }

            const bookings = await prisma.bookings.findMany({
                where: {
                    id: { in: bookingIds },
                    user_id: userId,
                    isPaid: false
                }
            });

            if (bookings.length === 0) return res.status(400).json({ message: "Đơn hàng không hợp lệ hoặc đã thanh toán." });

            const totalAmount = bookings.reduce((sum, b) => sum + Number(b.amount), 0);

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { organization: true }
            });

            const tx = await prisma.$transaction(async (prismaTx) => {
                const newTx = await prismaTx.transactions.create({
                    data: {
                        wallet_id: userId,
                        amount: totalAmount,
                        transaction_type: "PAYMENT",
                        status: "PENDING",
                        description: `Thanh toán ${bookings.length} suất ăn`,
                        created_by: userId
                    }
                });

                await prismaTx.bookings.updateMany({
                    where: { id: { in: bookingIds } },
                    data: { transaction_id: newTx.id }
                });

                return newTx;
            });

            const shortTxId = tx.id.split('-')[0].toUpperCase();
            const transferContent = `TT ${user.employeeCode} ${shortTxId}`;

            const bankId = user.organization?.defaultBankName || "MB";
            const accountNo = user.organization?.defaultBankAccount || "10000492004";

            const quickLink = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${totalAmount}&addInfo=${encodeURIComponent(transferContent)}`;

            const qrBase64 = await QRCode.toDataURL(quickLink);

            return res.json({
                success: true,
                message: "Đã tạo yêu cầu thanh toán.",
                data: {
                    transactionId: tx.id,
                    amount: totalAmount,
                    bookingCount: bookings.length,
                    content: transferContent,
                    qrImage: qrBase64,
                    qrLink: quickLink
                }
            });

        } catch (error) {
            console.error("Create Payment Error:", error);
            res.status(500).json({ message: "Lỗi tạo thanh toán" });
        }
    },

    // 5. Admin Duyệt thanh toán
    approvePayment: async (req, res) => {
        try {
            const { transactionId, status, adminNote } = req.body;
            const adminId = req.user.userId || req.user.id;

            if (!['SUCCESS', 'FAILED'].includes(status)) {
                return res.status(400).json({ message: "Trạng thái không hợp lệ" });
            }

            const tx = await prisma.transactions.findUnique({ where: { id: transactionId } });
            if (!tx || tx.status !== 'PENDING') {
                return res.status(400).json({ message: "Giao dịch không tồn tại hoặc đã xử lý." });
            }

            await prisma.$transaction(async (prismaTx) => {
                await prismaTx.transactions.update({
                    where: { id: transactionId },
                    data: {
                        status: status,
                        description: tx.description + (adminNote ? ` | Note: ${adminNote}` : ""),
                        created_by: adminId
                    }
                });

                if (status === 'SUCCESS') {
                    await prismaTx.bookings.updateMany({
                        where: { transaction_id: transactionId },
                        data: { isPaid: true }
                    });
                } else {
                    await prismaTx.bookings.updateMany({
                        where: { transaction_id: transactionId },
                        data: { transaction_id: null }
                    });
                }
            });

            return res.json({ success: true, message: "Đã cập nhật trạng thái giao dịch." });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Lỗi xử lý giao dịch" });
        }
    },

    // 6. Admin xem danh sách giao dịch
    getAllTransactions: async (req, res) => {
        try {
            const { status, page = 1, limit = 10 } = req.query;
            const skip = (Number(page) - 1) * Number(limit);
            const where = {};
            if (status) where.status = status;

            const [transactions, total] = await Promise.all([
                prisma.transactions.findMany({
                    where,
                    skip,
                    take: Number(limit),
                    orderBy: { created_at: 'desc' },
                    include: {
                        users: { select: { fullName: true, employeeCode: true, email: true } },
                        bookings: { select: { code: true, amount: true, booking_date: true } }
                    }
                }),
                prisma.transactions.count({ where })
            ]);

            return res.json({
                success: true,
                data: normalizeTransactions ? normalizeTransactions(transactions) : transactions,
                pagination: { total, page: Number(page), limit: Number(limit) }
            });
        } catch (error) {
            res.status(500).json({ message: "Lỗi server" });
        }
    }
};

export default PaymentController;