const express = require('express');
const router = express.Router();
const chatbotController = require('../../controller/chatbot/chatbot.controller');
const auth = require('../../middleware/auth.middleware');

const buckets = new Map();
const rateLimit = (req, res, next) => {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter(t => now - t < 60_000);
  if (recent.length >= 20) {
    return res.status(429).json({ success: false, message: 'Bạn gửi tin nhắn quá nhanh. Vui lòng thử lại sau một phút.' });
  }
  recent.push(now);
  buckets.set(key, recent);
  next();
};

// Đón request từ Web: POST /api/chatbot/chat
router.post('/chat', rateLimit, auth.optionalAuthenticate, chatbotController.handleChat);

module.exports = router;
