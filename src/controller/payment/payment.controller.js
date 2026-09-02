const paymentService = require("../../service/payment/payment.service");
const db = require("../../../models");

const sepayWebhook = async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];

        const sepayApiKey = process.env.SEPAY_API_KEY;
        if (!authHeader || (!authHeader.includes(`Apikey ${sepayApiKey}`) && !authHeader.includes(`Bearer ${sepayApiKey}`))) {
            console.warn("⚠️ [Sepay Webhook] Cảnh báo: Unauthorized Access - Sai API Key!");
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const paymentData = req.body;
        console.log("🔔 [Sepay Webhook] Nhận được giao dịch mới:", paymentData);

        const result = await paymentService.handleSepayTransaction(paymentData);

        return res.status(200).json({ success: true, message: "Webhook received and processed" });
    } catch (error) {
        console.error("❌ [Sepay Webhook] Lỗi khi xử lý webhook:", error);
        return res.status(200).json({ success: false, message: "Internal server error during processing" });
    }
};

const checkPaymentStatus = async (req, res) => {
    try {
        const { bookingCode, amount } = req.query;
        if (!bookingCode) {
            return res.status(400).json({ success: false, message: "Missing bookingCode" });
        }

        const result = await paymentService.checkPaymentStatus(bookingCode);
        return res.status(200).json({ success: true, isPaid: result.isPaid });
    } catch (error) {
        console.error("❌ [Check Payment Status] Lỗi:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const initPayment = async (req, res) => {
    try {
        const { orderId, amount } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, message: "Missing orderId" });
        }
        const payment = await paymentService.initPayment(orderId, amount);
        return res.status(200).json({ success: true, data: payment });
    } catch (error) {
        console.error("❌ [Init Payment] Lỗi:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const confirmPayment = async (req, res) => {
    try {
        const { orderId, amount, method, pointsRedeemed } = req.body;
        const receptionistId = res.locals.user?.id || null;
        if (!orderId) {
            return res.status(400).json({ success: false, message: "Missing orderId" });
        }
        const result = await paymentService.confirmPayment(orderId, amount, method || 'VIETQR', receptionistId, pointsRedeemed);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ [Confirm Payment] Lỗi:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const confirmDepositCash = async (req, res) => {
    try {
        const { quotationId } = req.body;
        const receptionistId = res.locals.user?.id || null;
        if (!quotationId) {
            return res.status(400).json({ success: false, message: "Thiếu mã báo giá" });
        }
        const result = await paymentService.confirmDepositCash(quotationId, receptionistId);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ [Confirm Deposit Cash] Lỗi:", error);
        return res
            .status(error.status || 500)
            .json({ success: false, message: error.message || "Internal server error" });
    }
};

module.exports = {
    sepayWebhook,
    checkPaymentStatus,
    initPayment,
    confirmPayment,
    confirmDepositCash,
};
