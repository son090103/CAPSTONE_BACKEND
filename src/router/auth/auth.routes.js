const express = require("express");

const router = express.Router();
const passport = require("passport");
const authController = require("../../controller/auth/auth.controller");
const { authenticate } = require("../../middleware/auth.middleware");

router.post("/login", authController.login);
router.post("/register", authController.register);
router.post("/phone", authController.checkPhone);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", authenticate, authController.logout);
router.post("/forgot-password", authController.forgotPassword);
router.get("/profile", authenticate, authController.getProfile);
router.get("/google",passport.authenticate("google", {scope: ["profile", "email"],session: false,}));
router.get("/google/callback",passport.authenticate("google", {session: false,failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed`,}),authController.googleCallback);

module.exports = router;
