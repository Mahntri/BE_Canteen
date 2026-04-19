import prisma from '../config/prisma.js';

const checkDebtLock = async (req, res, next) => {
    try {
        const user = req.user;
        const userId = user.userId || user.id;

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Token không hợp lệ (Không tìm thấy User ID trong token)." 
            });
        }

        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, orgId: true }
        });

        if (!currentUser) {
            return res.status(401).json({ message: "Không tìm thấy thông tin người dùng trong DB" });
        }

        const [wallet, orgSetting] = await Promise.all([
            prisma.wallets.findUnique({ where: { user_id: userId } }),
            prisma.organizationSetting.findFirst({ where: { orgId: currentUser.orgId } }) 
        ]);

        if (!wallet) return res.status(403).json({ message: "Ví chưa được kích hoạt" });

        const balance = Number(wallet.balance);
        const maxDebt = Number(orgSetting?.maxDebtAmount || 0);

        if (balance < -maxDebt) {
            return res.status(403).json({ 
                success: false,
                code: "DEBT_LIMIT_EXCEEDED",
                message: `Bạn đang nợ ${Math.abs(balance).toLocaleString()}đ, vượt quá hạn mức cho phép (${maxDebt.toLocaleString()}đ). Vui lòng thanh toán.` 
            });
        }

        req.user.id = userId;
        next();
    } catch (error) {
        console.error("Debt Check Error:", error);
        res.status(500).json({ message: "Lỗi kiểm tra công nợ", detail: error.message });
    }
};

export default checkDebtLock;