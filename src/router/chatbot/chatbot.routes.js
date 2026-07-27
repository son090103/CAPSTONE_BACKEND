const express = require('express');
const router = express.Router();
const chatbotController = require('../../controller/chatbot/chatbot.controller');

// Đón request từ Web: POST /api/chatbot/chat
router.post('/chat', chatbotController.handleChat);

module.exports = router;
