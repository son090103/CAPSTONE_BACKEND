const ROLES = require("./../constants/roles.js");
const authRoutes = require("./../router/auth/auth.routes.js");
const customerRoutes = require("./customer/customer.routes");
const adminRoutes = require("../router/admin/admin.routes.js");
const guestRoutes = require("./common/guest.routes.js");
const inventoryRoutes = require("../router/inventory/inventory.routes.js");
const checkClient = require("../middleware/auth.middleware.js");
const receptionistRoutes = require("./../router/receptionist/receptionist.routes.js");
const technicianRoutes = require("./../router/technician/technician.routes.js");
const technicianLeaderRoutes = require("./../router/technicianLeader/technicianLeader.routes.js");
const paymentRoutes = require("./../router/payment/payment.routes")

const chatbotRoutes = require("./chatbot/chatbot.routes.js");

module.exports = [
  {
    prefix: "/api/auth/",
    router: authRoutes,
  },
  {
    prefix: "/api/guest",
    router: guestRoutes,
  },
  {
    prefix: "/api/chatbot",
    router: chatbotRoutes,
  },

  {
    prefix: "/api/customer",
    middlewares: [
      checkClient.authenticate,
      checkClient.authorizeRoles(ROLES.CUSTOMER),
    ],
    router: customerRoutes,
  },
  {
    prefix: "/api/admin",
    middlewares: [
      checkClient.authenticate,
      checkClient.authorizeRoles(ROLES.ADMIN),
    ],
    router: adminRoutes,
  },
  {
    prefix: "/api/inventory",
    middlewares: [
      checkClient.authenticate,
      checkClient.authorizeRoles(ROLES.INVENTORY_MANAGER),
    ],
    router: inventoryRoutes
  },
  {
    prefix: "/api/receptionist",
    middlewares: [
      checkClient.authenticate,
      checkClient.authorizeRoles(ROLES.RECEPTIONIST),
    ],
    router: receptionistRoutes,
  },
  {
    prefix: "/api/technician",
    middlewares: [
      checkClient.authenticate,
      checkClient.authorizeRoles(ROLES.TECHNICIAN),
    ],
    router: technicianRoutes,
  },
  {
    prefix: "/api/payment",
    router: paymentRoutes,
  },
  {
    prefix: "/api/head-technician",
    middlewares: [
      checkClient.authenticate,
      checkClient.authorizeRoles(ROLES.TECHNICIAN_LEADER),
    ],
    router: technicianLeaderRoutes,
  },
];
