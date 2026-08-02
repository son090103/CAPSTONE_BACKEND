const express = require("express");
const router = express.Router();
const checkClient = require("../../middleware/auth.middleware.js");

const { sepayWebhook, checkPaymentStatus, initPayment, confirmPayment } = require("../../controller/payment/payment.controller");

router.post("/sepay-webhook", sepayWebhook);
router.get("/check-status", checkPaymentStatus);
router.post("/init-payment", initPayment);
router.post("/confirm-payment", checkClient.authenticate, confirmPayment);

module.exports = router;
