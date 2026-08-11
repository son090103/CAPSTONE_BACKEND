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
  "http://127.0.0.1:5173",
  "https://agm-garage.id.vn",
  "https://www.agm-garage.id.vn",
  "192.168.0.191:8081",
  "https://12bf-171-225-184-240.ngrok-free.app",
  "https://bd50-171-225-184-240.ngrok-free.app",
  "http://localhost:5173/"
];
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (whitelist.includes(origin)) return true;
  if (whitelist.includes(origin + "/")) return true; // check with trailing slash

  // Allow localhost on any port (useful for development)
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
    return true;
  }

  // Allow any local network IP on any port (useful for Expo/React Native)
  if (/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
    return true;
  }

  return false;
};

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        console.error("Blocked by CORS. Origin requested:", origin);
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
const { verifyAccessToken } = require("./src/util/jwt.util");
const db = require("./models");
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

  socket.on('join-role', (roleCode) => {
    socket.join(`role-${roleCode}`);
  });
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
  });

  // Khách hàng theo dõi tiến độ sửa chữa realtime (emitProgress dùng room này)
  socket.on('join-vehicle-tracking', (serviceOrderId) => {
    socket.join(`service-order-${serviceOrderId}`);
  });
  socket.on('leave-vehicle-tracking', (serviceOrderId) => {
    socket.leave(`service-order-${serviceOrderId}`);
  });

  const authorizeRescueSocket = async (data, requireTechnician = false) => {
    const token = data?.token;
    const rescueId = Number(data?.rescueId);
    if (!token || !Number.isInteger(rescueId) || rescueId <= 0) throw new Error('Dữ liệu theo dõi cứu hộ không hợp lệ');

    const decoded = verifyAccessToken(token);
    const rescue = await db.Rescue_Requests.findByPk(rescueId, {
      include: [{ model: db.Customers, as: 'customer', attributes: ['id', 'user_id'] }],
    });
    if (!rescue) throw new Error('Không tìm thấy yêu cầu cứu hộ');

    const isTechnician = Number(rescue.technician_id) === Number(decoded.id);
    const isCustomer = Number(rescue.customer?.user_id) === Number(decoded.id);
    if ((requireTechnician && !isTechnician) || (!requireTechnician && !isTechnician && !isCustomer)) {
      throw new Error('Bạn không có quyền theo dõi yêu cầu cứu hộ này');
    }
    return { rescue, userId: Number(decoded.id) };
  };

  socket.on('join-rescue-tracking', async (data, acknowledgement) => {
    try {
      const { rescue } = await authorizeRescueSocket(data);
      socket.join(`rescue-${rescue.id}`);
      acknowledgement?.({ success: true });
    } catch (error) {
      acknowledgement?.({ success: false, message: error.message });
    }
  });

  socket.on('leave-rescue-tracking', (rescueId) => {
    socket.leave(`rescue-${Number(rescueId)}`);
  });

  socket.on('update-rescue-location', async (data, acknowledgement) => {
    try {
      const latitude = Number(data?.latitude);
      const longitude = Number(data?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        throw new Error('Tọa độ GPS không hợp lệ');
      }

      const { rescue, userId } = await authorizeRescueSocket(data, true);
      if (!['EN_ROUTE', 'TOWING'].includes(rescue.status)) {
        throw new Error('Cuốc cứu hộ không ở trạng thái cho phép chia sẻ vị trí');
      }

      await db.User.update({ latitude, longitude }, { where: { id: userId } });
      const payload = {
        rescueId: rescue.id,
        latitude,
        longitude,
        accuracy: Number.isFinite(Number(data?.accuracy)) ? Number(data.accuracy) : null,
        heading: Number.isFinite(Number(data?.heading)) ? Number(data.heading) : null,
        speed: Number.isFinite(Number(data?.speed)) ? Number(data.speed) : null,
        recordedAt: new Date().toISOString(),
      };
      io.to(`rescue-${rescue.id}`).emit('rescue-location-updated', payload);
      acknowledgement?.({ success: true });
    } catch (error) {
      acknowledgement?.({ success: false, message: error.message });
    }
  });
});
const ROUTES = require("./src/router/registry.routes");
require("./src/jobs/pricingRule.job");
require("./src/jobs/maintenanceReminder.job");
app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        console.error("Blocked by CORS. Origin requested:", origin);
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
