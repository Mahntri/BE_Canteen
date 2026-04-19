import { Router } from "express";
import PaymentController from "../controller/payment.controller.js";
import { authGuard, requireRole } from "../middleware/auth.middleware.js"; 

const paymentRouter = Router();

paymentRouter.use(authGuard);

// === USER ===
paymentRouter.get("/wallet", PaymentController.getWalletInfo);
paymentRouter.get("/my-transactions", PaymentController.getMyTransactions);
paymentRouter.get("/unpaid-bookings", PaymentController.getUnpaidBookings);
paymentRouter.post("/create-request", PaymentController.createPaymentRequest);

// === ADMIN ===
paymentRouter.get("/admin/transactions", requireRole("ADMIN", "SUPERVISOR"), PaymentController.getAllTransactions);
paymentRouter.post("/admin/approve", requireRole("ADMIN", "SUPERVISOR"), PaymentController.approvePayment);

export default paymentRouter;