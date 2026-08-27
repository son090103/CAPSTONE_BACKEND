const appointmentService = require("../../../service/customer/appointment.service");

jest.mock("../../../service/customer/appointment.service", () => ({
  getAppointments: jest.fn(),
  createAppointment: jest.fn(),
  deleteAppointment: jest.fn(),
  cancelAppointment: jest.fn(),
  getAppointmentVehicles: jest.fn(),
}));

const appointmentController = require("../../../controller/customer/appointment.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-04: Appointment Booking Controller Tests (Customer Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. Booking Appointment
   * ========================================================================== */
  describe("Booking Appointment", () => {
    it("UTCID01 - Booking Appointment - should return 201 Created when valid appointment details are provided", async () => {
      const mockCreatedAppointment = {
        id: 10,
        customer_id: 1,
        vehicle_id: 2,
        booking_type: "CUSTOMER_SPECIFIC",
        scheduled_time: "2026-08-10T09:00:00.000Z",
        status: "CONFIRMED",
      };
      appointmentService.createAppointment.mockResolvedValue(mockCreatedAppointment);

      const req = {
        query: {},
        body: {
          vehicle_id: 2,
          booking_type: "CUSTOMER_SPECIFIC",
          scheduled_time: "2026-08-10T09:00:00.000Z",
          service_ids: [1],
          notes: "Periodic maintenance",
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.createAppointment(req, res);

      expect(appointmentService.createAppointment).toHaveBeenCalledWith(1, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đặt lịch hẹn thành công",
        data: mockCreatedAppointment,
      });
    });

    it("UTCID02 - Booking Appointment - should return 401 Unauthorized when user is not authenticated", async () => {
      const req = {
        query: {},
        body: {
          vehicle_id: 2,
          booking_type: "CUSTOMER_SPECIFIC",
          scheduled_time: "2026-08-10T09:00:00.000Z",
        },
      };
      const res = createMockResponse();

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
      expect(appointmentService.createAppointment).not.toHaveBeenCalled();
    });

    it("UTCID03 - Booking Appointment - should return 400 Bad Request when payload validation fails", async () => {
      const req = {
        query: {},
        body: {
          booking_type: "INVALID_TYPE",
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.any(String),
        })
      );
      expect(appointmentService.createAppointment).not.toHaveBeenCalled();
    });

    it("UTCID04 - Booking Appointment - should return 400 Bad Request when garage capacity is exceeded", async () => {
      const error = {
        status: 400,
        message: "Garage hiện tại không có khả năng tiếp nhận thêm xe",
      };
      appointmentService.createAppointment.mockRejectedValue(error);

      const req = {
        query: {},
        body: {
          vehicle_id: 2,
          booking_type: "CUSTOMER_SPECIFIC",
          scheduled_time: "2026-08-10T09:00:00.000Z",
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Garage hiện tại không có khả năng tiếp nhận thêm xe",
      });
    });

    it("UTCID05 - Booking Appointment - should return 404 Not Found when customer profile is missing", async () => {
      const error = { status: 404, message: "Hồ sơ khách hàng không tồn tại" };
      appointmentService.createAppointment.mockRejectedValue(error);

      const req = {
        query: {},
        body: {
          vehicle_id: 2,
          booking_type: "CUSTOMER_SPECIFIC",
          scheduled_time: "2026-08-10T09:00:00.000Z",
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 99 };

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Hồ sơ khách hàng không tồn tại",
      });
    });

    it("UTCID06 - Booking Appointment - should return 500 Internal Server Error on database failure", async () => {
      appointmentService.createAppointment.mockRejectedValue(new Error("Database transaction failed"));

      const req = {
        query: {},
        body: {
          vehicle_id: 2,
          booking_type: "CUSTOMER_SPECIFIC",
          scheduled_time: "2026-08-10T09:00:00.000Z",
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Database transaction failed",
      });
    });
  });

  /* ==========================================================================
   * 2. View Appointment History
   * ========================================================================== */
  describe("View Appointment History", () => {
    it("UTCID07 - View Appointment History - should return 200 OK with appointment list for authenticated customer", async () => {
      const mockAppointments = [
        {
          id: 1,
          scheduled_time: "2026-08-01T08:00:00.000Z",
          status: "CONFIRMED",
          vehicle: { license_plate: "30A-123.45" },
        },
      ];
      appointmentService.getAppointments.mockResolvedValue(mockAppointments);

      const req = { query: {} };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.getAppointment(req, res);

      expect(appointmentService.getAppointments).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy danh sách lịch hẹn thành công",
        data: mockAppointments,
      });
    });

    it("UTCID08 - View Appointment History - should return 401 Unauthorized when user is unauthenticated", async () => {
      const req = { query: {} };
      const res = createMockResponse();

      await appointmentController.getAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
      expect(appointmentService.getAppointments).not.toHaveBeenCalled();
    });

    it("UTCID09 - View Appointment History - should return 500 Internal Server Error when service fails", async () => {
      appointmentService.getAppointments.mockRejectedValue(new Error("Unable to fetch appointments"));

      const req = { query: {} };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.getAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Unable to fetch appointments",
      });
    });
  });

  /* ==========================================================================
   * 3. Cancel & Manage Appointments
   * ========================================================================== */
  describe("Cancel & Manage Appointments", () => {
    it("UTCID10 - Cancel Appointment - should return 200 OK when appointment is successfully cancelled", async () => {
      const mockResult = {
        message: "Hủy lịch hẹn thành công",
        data: { id: 5, status: "CANCELLED" },
      };
      appointmentService.cancelAppointment.mockResolvedValue(mockResult);

      const req = { query: {}, body: { id: 5 } };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.cancelAppointment(req, res);

      expect(appointmentService.cancelAppointment).toHaveBeenCalledWith(1, 5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Hủy lịch hẹn thành công",
        data: { id: 5, status: "CANCELLED" },
      });
    });

    it("UTCID11 - Cancel Appointment - should return 400 Bad Request when appointment ID is missing", async () => {
      const req = { query: {}, body: {} };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.cancelAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Vui lòng cung cấp ID lịch hẹn cần hủy",
      });
    });

    it("UTCID12 - Cancel Appointment - should return 400 Bad Request when attempting to cancel appointment with invalid status", async () => {
      const error = {
        status: 400,
        message: "Không thể hủy lịch hẹn khi đã ở trạng thái: IN_PROGRESS",
      };
      appointmentService.cancelAppointment.mockRejectedValue(error);

      const req = { query: {}, body: { id: 10 } };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.cancelAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Không thể hủy lịch hẹn khi đã ở trạng thái: IN_PROGRESS",
      });
    });

    it("UTCID13 - Available Vehicles - should return 200 OK with list of customer vehicles available for booking", async () => {
      const mockVehicles = [
        { id: 1, license_plate: "30A-123.45", isDisabled: false },
      ];
      appointmentService.getAppointmentVehicles.mockResolvedValue(mockVehicles);

      const req = { query: {} };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.getAppointmentVehicle(req, res);

      expect(appointmentService.getAppointmentVehicles).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy danh sách xe khả dụng thành công",
        data: mockVehicles,
      });
    });
  });
});















// const appointmentService = require("../../../service/customer/appointment.service");

// jest.mock("../../../service/customer/appointment.service", () => ({
//   getAppointments: jest.fn(),
//   createAppointment: jest.fn(),
//   deleteAppointment: jest.fn(),
//   cancelAppointment: jest.fn(),
//   getAppointmentVehicles: jest.fn(),
// }));

// const appointmentController = require("../../../controller/customer/appointment.controller");

// const createMockResponse = () => {
//   const res = {
//     locals: {},
//   };
//   res.status = jest.fn().mockReturnValue(res);
//   res.json = jest.fn().mockReturnValue(res);
//   return res;
// };

// describe("FE-04: Appointment Booking Controller Tests (Customer Role)", () => {
//   beforeEach(() => {
//     jest.clearAllMocks();
//   });

//   /* ==========================================================================
//    * 1. Booking Appointment
//    * ========================================================================== */
//   describe("Booking Appointment", () => {
//     it("UTCID01 - Booking Appointment - should return 201 Created when valid appointment details are provided", async () => {
//       const mockCreatedAppointment = {
//         id: 10,
//         customer_id: 1,
//         vehicle_id: 2,
//         booking_type: "CUSTOMER_SPECIFIC",
//         scheduled_time: "2026-08-10T09:00:00.000Z",
//         status: "CONFIRMED",
//       };
//       appointmentService.createAppointment.mockResolvedValue(mockCreatedAppointment);

//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//           service_ids: [1],
//           notes: "Periodic maintenance",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.createAppointment(req, res);

//       expect(appointmentService.createAppointment).toHaveBeenCalledWith(1, expect.any(Object));
//       expect(res.status).toHaveBeenCalledWith(201);
//       expect(res.json).toHaveBeenCalledWith({
//         success: true,
//         message: "Đặt lịch hẹn thành công",
//         data: mockCreatedAppointment,
//       });
//     });

//     it("UTCID02 - Booking Appointment - should return 401 Unauthorized when user is not authenticated", async () => {
//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//         },
//       };
//       const res = createMockResponse();

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(401);
//       expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
//       expect(appointmentService.createAppointment).not.toHaveBeenCalled();
//     });

//     it("UTCID03 - Booking Appointment - should return 400 Bad Request when payload validation fails", async () => {
//       const req = {
//         query: {},
//         body: {
//           booking_type: "INVALID_TYPE",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith(
//         expect.objectContaining({
//           success: false,
//           message: expect.any(String),
//         })
//       );
//       expect(appointmentService.createAppointment).not.toHaveBeenCalled();
//     });

//     it("UTCID04 - Booking Appointment - should return 400 Bad Request when garage capacity is exceeded", async () => {
//       const error = {
//         status: 400,
//         message: "Garage hiện tại không có khả năng tiếp nhận thêm xe",
//       };
//       appointmentService.createAppointment.mockRejectedValue(error);

//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Garage hiện tại không có khả năng tiếp nhận thêm xe",
//       });
//     });

//     it("UTCID05 - Booking Appointment - should return 404 Not Found when customer profile is missing", async () => {
//       const error = { status: 404, message: "Hồ sơ khách hàng không tồn tại" };
//       appointmentService.createAppointment.mockRejectedValue(error);

//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 99 };

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(404);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Hồ sơ khách hàng không tồn tại",
//       });
//     });

//     it("UTCID06 - Booking Appointment - should return 500 Internal Server Error on database failure", async () => {
//       appointmentService.createAppointment.mockRejectedValue(new Error("Database transaction failed"));

//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(500);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Database transaction failed",
//       });
//     });
//   });

//   /* ==========================================================================
//    * 2. View Appointment History
//    * ========================================================================== */
//   describe("View Appointment History", () => {
//     it("UTCID07 - View Appointment History - should return 200 OK with appointment list for authenticated customer", async () => {
//       const mockAppointments = [
//         {
//           id: 1,
//           scheduled_time: "2026-08-01T08:00:00.000Z",
//           status: "CONFIRMED",
//           vehicle: { license_plate: "30A-123.45" },
//         },
//       ];
//       appointmentService.getAppointments.mockResolvedValue(mockAppointments);

//       const req = { query: {} };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.getAppointment(req, res);

//       expect(appointmentService.getAppointments).toHaveBeenCalledWith(1);
//       expect(res.status).toHaveBeenCalledWith(200);
//       expect(res.json).toHaveBeenCalledWith({
//         success: true,
//         message: "Lấy danh sách lịch hẹn thành công",
//         data: mockAppointments,
//       });
//     });

//     it("UTCID08 - View Appointment History - should return 401 Unauthorized when user is unauthenticated", async () => {
//       const req = { query: {} };
//       const res = createMockResponse();

//       await appointmentController.getAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(401);
//       expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
//       expect(appointmentService.getAppointments).not.toHaveBeenCalled();
//     });

//     it("UTCID09 - View Appointment History - should return 500 Internal Server Error when service fails", async () => {
//       appointmentService.getAppointments.mockRejectedValue(new Error("Unable to fetch appointments"));

//       const req = { query: {} };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.getAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(500);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Unable to fetch appointments",
//       });
//     });
//   });

//   /* ==========================================================================
//    * 3. Cancel & Manage Appointments
//    * ========================================================================== */
//   describe("Cancel & Manage Appointments", () => {
//     it("UTCID10 - Cancel Appointment - should return 200 OK when appointment is successfully cancelled", async () => {
//       const mockResult = {
//         message: "Hủy lịch hẹn thành công",
//         data: { id: 5, status: "CANCELLED" },
//       };
//       appointmentService.cancelAppointment.mockResolvedValue(mockResult);

//       const req = { query: {}, body: { id: 5 } };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.cancelAppointment(req, res);

//       expect(appointmentService.cancelAppointment).toHaveBeenCalledWith(1, 5);
//       expect(res.status).toHaveBeenCalledWith(200);
//       expect(res.json).toHaveBeenCalledWith({
//         success: true,
//         message: "Hủy lịch hẹn thành công",
//         data: { id: 5, status: "CANCELLED" },
//       });
//     });

//     it("UTCID11 - Cancel Appointment - should return 400 Bad Request when appointment ID is missing", async () => {
//       const req = { query: {}, body: {} };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.cancelAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Vui lòng cung cấp ID lịch hẹn cần hủy",
//       });
//     });

//     it("UTCID12 - Cancel Appointment - should return 400 Bad Request when attempting to cancel appointment with invalid status", async () => {
//       const error = {
//         status: 400,
//         message: "Không thể hủy lịch hẹn khi đã ở trạng thái: IN_PROGRESS",
//       };
//       appointmentService.cancelAppointment.mockRejectedValue(error);

//       const req = { query: {}, body: { id: 10 } };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.cancelAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Không thể hủy lịch hẹn khi đã ở trạng thái: IN_PROGRESS",
//       });
//     });

//     it("UTCID13 - Available Vehicles - should return 200 OK with list of customer vehicles available for booking", async () => {
//       const mockVehicles = [
// //         { id: 1, license_plate: "30A-123.45", isDisabled: false },
// //       ];
// //       appointmentService.getAppointmentVehicles.mockResolvedValue(mockVehicles);

// //       const req = { query: {} };
// //       const res = createMockResponse();
// //       res.locals.user = { id: 1 };

// //       await appointmentController.getAppointmentVehicle(req, res);

// //       expect(appointmentService.getAppointmentVehicles).toHaveBeenCalledWith(1);
// //       expect(res.status).toHaveBeenCalledWith(200);
// //       expect(res.json).toHaveBeenCalledWith({
// //         success: true,
// //         message: "Lấy danh sách xe khả dụng thành công",
// //         data: mockVehicles,
// //       });
// //     });
// //   });
// // });
// //const appointmentService = require("../../../service/customer/appointment.service");

// jest.mock("../../../service/customer/appointment.service", () => ({
//   getAppointments: jest.fn(),
//   createAppointment: jest.fn(),
//   deleteAppointment: jest.fn(),
//   cancelAppointment: jest.fn(),
//   getAppointmentVehicles: jest.fn(),
// }));

// const appointmentController = require("../../../controller/customer/appointment.controller");

// const createMockResponse = () => {
//   const res = {
//     locals: {},
//   };
//   res.status = jest.fn().mockReturnValue(res);
//   res.json = jest.fn().mockReturnValue(res);
//   return res;
// };

// describe("FE-04: Appointment Booking Controller Tests (Customer Role)", () => {
//   beforeEach(() => {
//     jest.clearAllMocks();
//   });

//   /* ==========================================================================
//    * 1. Booking Appointment
//    * ========================================================================== */
//   describe("Booking Appointment", () => {
//     it("UTCID01 - Booking Appointment - should return 201 Created when valid appointment details are provided", async () => {
//       const mockCreatedAppointment = {
//         id: 10,
//         customer_id: 1,
//         vehicle_id: 2,
//         booking_type: "CUSTOMER_SPECIFIC",
//         scheduled_time: "2026-08-10T09:00:00.000Z",
//         status: "CONFIRMED",
//       };
//       appointmentService.createAppointment.mockResolvedValue(mockCreatedAppointment);

//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//           service_ids: [1],
//           notes: "Periodic maintenance",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.createAppointment(req, res);

//       expect(appointmentService.createAppointment).toHaveBeenCalledWith(1, expect.any(Object));
//       expect(res.status).toHaveBeenCalledWith(201);
//       expect(res.json).toHaveBeenCalledWith({
//         success: true,
//         message: "Đặt lịch hẹn thành công",
//         data: mockCreatedAppointment,
//       });
//     });

//     it("UTCID02 - Booking Appointment - should return 401 Unauthorized when user is not authenticated", async () => {
//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//         },
//       };
//       const res = createMockResponse();

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(401);
//       expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
//       expect(appointmentService.createAppointment).not.toHaveBeenCalled();
//     });

//     it("UTCID03 - Booking Appointment - should return 400 Bad Request when payload validation fails", async () => {
//       const req = {
//         query: {},
//         body: {
//           booking_type: "INVALID_TYPE",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith(
//         expect.objectContaining({
//           success: false,
//           message: expect.any(String),
//         })
//       );
//       expect(appointmentService.createAppointment).not.toHaveBeenCalled();
//     });

//     it("UTCID04 - Booking Appointment - should return 400 Bad Request when garage capacity is exceeded", async () => {
//       const error = {
//         status: 400,
//         message: "Garage hiện tại không có khả năng tiếp nhận thêm xe",
//       };
//       appointmentService.createAppointment.mockRejectedValue(error);

//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Garage hiện tại không có khả năng tiếp nhận thêm xe",
//       });
//     });

//     it("UTCID05 - Booking Appointment - should return 404 Not Found when customer profile is missing", async () => {
//       const error = { status: 404, message: "Hồ sơ khách hàng không tồn tại" };
//       appointmentService.createAppointment.mockRejectedValue(error);

//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 99 };

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(404);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Hồ sơ khách hàng không tồn tại",
//       });
//     });

//     it("UTCID06 - Booking Appointment - should return 500 Internal Server Error on database failure", async () => {
//       appointmentService.createAppointment.mockRejectedValue(new Error("Database transaction failed"));

//       const req = {
//         query: {},
//         body: {
//           vehicle_id: 2,
//           booking_type: "CUSTOMER_SPECIFIC",
//           scheduled_time: "2026-08-10T09:00:00.000Z",
//         },
//       };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.createAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(500);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Database transaction failed",
//       });
//     });
//   });

//   /* ==========================================================================
//    * 2. View Appointment History
//    * ========================================================================== */
//   describe("View Appointment History", () => {
//     it("UTCID07 - View Appointment History - should return 200 OK with appointment list for authenticated customer", async () => {
//       const mockAppointments = [
//         {
//           id: 1,
//           scheduled_time: "2026-08-01T08:00:00.000Z",
//           status: "CONFIRMED",
//           vehicle: { license_plate: "30A-123.45" },
//         },
//       ];
//       appointmentService.getAppointments.mockResolvedValue(mockAppointments);

//       const req = { query: {} };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.getAppointment(req, res);

//       expect(appointmentService.getAppointments).toHaveBeenCalledWith(1);
//       expect(res.status).toHaveBeenCalledWith(200);
//       expect(res.json).toHaveBeenCalledWith({
//         success: true,
//         message: "Lấy danh sách lịch hẹn thành công",
//         data: mockAppointments,
//       });
//     });

//     it("UTCID08 - View Appointment History - should return 401 Unauthorized when user is unauthenticated", async () => {
//       const req = { query: {} };
//       const res = createMockResponse();

//       await appointmentController.getAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(401);
//       expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
//       expect(appointmentService.getAppointments).not.toHaveBeenCalled();
//     });

//     it("UTCID09 - View Appointment History - should return 500 Internal Server Error when service fails", async () => {
//       appointmentService.getAppointments.mockRejectedValue(new Error("Unable to fetch appointments"));

//       const req = { query: {} };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.getAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(500);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Unable to fetch appointments",
//       });
//     });
//   });

//   /* ==========================================================================
//    * 3. Cancel & Manage Appointments
//    * ========================================================================== */
//   describe("Cancel & Manage Appointments", () => {
//     it("UTCID10 - Cancel Appointment - should return 200 OK when appointment is successfully cancelled", async () => {
//       const mockResult = {
//         message: "Hủy lịch hẹn thành công",
//         data: { id: 5, status: "CANCELLED" },
//       };
//       appointmentService.cancelAppointment.mockResolvedValue(mockResult);

//       const req = { query: {}, body: { id: 5 } };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.cancelAppointment(req, res);

//       expect(appointmentService.cancelAppointment).toHaveBeenCalledWith(1, 5);
//       expect(res.status).toHaveBeenCalledWith(200);
//       expect(res.json).toHaveBeenCalledWith({
//         success: true,
//         message: "Hủy lịch hẹn thành công",
//         data: { id: 5, status: "CANCELLED" },
//       });
//     });

//     it("UTCID11 - Cancel Appointment - should return 400 Bad Request when appointment ID is missing", async () => {
//       const req = { query: {}, body: {} };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.cancelAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Vui lòng cung cấp ID lịch hẹn cần hủy",
//       });
//     });

//     it("UTCID12 - Cancel Appointment - should return 400 Bad Request when attempting to cancel appointment with invalid status", async () => {
//       const error = {
//         status: 400,
//         message: "Không thể hủy lịch hẹn khi đã ở trạng thái: IN_PROGRESS",
//       };
//       appointmentService.cancelAppointment.mockRejectedValue(error);

//       const req = { query: {}, body: { id: 10 } };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.cancelAppointment(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         message: "Không thể hủy lịch hẹn khi đã ở trạng thái: IN_PROGRESS",
//       });
//     });

//     it("UTCID13 - Available Vehicles - should return 200 OK with list of customer vehicles available for booking", async () => {
//       const mockVehicles = [
//         { id: 1, license_plate: "30A-123.45", isDisabled: false },
//       ];
//       appointmentService.getAppointmentVehicles.mockResolvedValue(mockVehicles);

//       const req = { query: {} };
//       const res = createMockResponse();
//       res.locals.user = { id: 1 };

//       await appointmentController.getAppointmentVehicle(req, res);

//       expect(appointmentService.getAppointmentVehicles).toHaveBeenCalledWith(1);
//       expect(res.status).toHaveBeenCalledWith(200);
//       expect(res.json).toHaveBeenCalledWith({
//         success: true,
//         message: "Lấy danh sách xe khả dụng thành công",
//         data: mockVehicles,
//       });
//     });
//   });
// });
