const express = require("express");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;
const bodyParser = require("body-parser");
const passport = require("passport");
const cors = require("cors");
const configureGoogle = require("././src/config/google.config");

const whitelist = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://agm-garage.id.vn",
  "https://www.agm-garage.id.vn",
  "192.168.0.191:8081",
  "https://7fd2-2405-4802-e682-2ac0-e8fe-f026-452b-f047.ngrok-free.app",
  "https://6f23-2405-4802-e682-2ac0-e8fe-f026-452b-f047.ngrok-free.app "
];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || whitelist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
configureGoogle(passport);
app.use(passport.initialize());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// cấu hình socket
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
// biến global
global._io = io; // gọi biến toàn cục

io.on('connection', (socket) => {
  // Lắng nghe sự kiện Khách hàng yêu cầu gọi Video (ZegoCloud)
  socket.on('request-video-call', (data) => {
    // Phát (Broadcast) thông báo cho các Lễ tân đang online
    socket.broadcast.emit('incoming-video-call', data);
  });

  // Khi một Lễ tân bấm "Nghe máy"
  socket.on('accept-video-call', (data) => {
    // Báo cho toàn bộ các Lễ tân khác để họ tự động tắt chuông báo
    socket.broadcast.emit('call-answered', data);
  });

  // Khi một bên kết thúc cuộc gọi
  socket.on('end-video-call', (data) => {
    socket.broadcast.emit('end-video-call', data);
  });

  // test ở lễ tân ( thực chất đây là technician )
  // Cho phép Client tham gia vào một Room cụ thể (vd: room theo ID người dùng)
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
  });

  // Lễ tân điều phối xe cứu hộ
  socket.on('dispatch-rescue-vehicle', (data) => {
    // Phát tọa độ xe cứu hộ CHỈ RIÊNG cho Khách hàng đó thông qua Room (Bảo mật vị trí)
    io.to(`customer_${data.customerId}`).emit('rescue-vehicle-dispatched', data);
    // Đồng thời phát cho Kỹ thuật viên để họ nhận thông báo
    io.to(`technician_${data.technicianId}`).emit('incoming-rescue-task', data);
  });
  socket.on('join-role', (roleCode) => {
    socket.join(`role-${roleCode}`);
  });
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
  });
});
const ROUTES = require("./src/router/registry.routes");
require("./src/jobs/pricingRule.job");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || whitelist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
// cách router để có thể hoạt động được
ROUTES.forEach((route) => {
  if (route.middlewares && route.middlewares.length > 0) {
    app.use(route.prefix, ...route.middlewares, route.router);
  } else {
    app.use(route.prefix, route.router);
  }
});

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
