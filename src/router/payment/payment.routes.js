const express = require("express");
const router = express.Router();

const { sepayWebhook, checkPaymentStatus, initPayment } = require("../../controller/payment/payment.controller");

router.post("/sepay-webhook", sepayWebhook);
router.get("/check-status", checkPaymentStatus);
router.post("/init-payment", initPayment);

module.exports = router;
