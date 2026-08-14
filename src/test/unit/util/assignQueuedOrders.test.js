const mockNotifyUser = jest.fn();
const mockCalculateAppointmentTime = jest.fn();

const mockDb = {
  Service_Bays: {
    findOne: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  Service_Orders: { findAll: jest.fn() },
  Appointments: { findAll: jest.fn() },
  Appointment_Details: {},
  Role: { findOne: jest.fn() },
  User: { findAll: jest.fn() },
  Task_Assignment: { count: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  Task: { findAll: jest.fn() },
};

jest.mock('../../../../models', () => mockDb);
jest.mock('../../../util/notification.util', () => ({ notifyUser: mockNotifyUser }));
jest.mock('../../../util/calculateAppointmentTime.util', () => ({
  calculateAppointmentTime: mockCalculateAppointmentTime,
}));

const assignQueuedOrders = require('../../../util/assignQueuedOrders.util');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };

describe('assignQueuedOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.Service_Bays.update.mockResolvedValue([1]);
    mockDb.Task.findAll.mockResolvedValue([]);
    mockDb.Task_Assignment.findOne.mockResolvedValue(null);
    mockDb.Role.findOne.mockResolvedValue({ id: 1 });
    mockDb.User.findAll.mockResolvedValue([{ id: 99 }]);
    mockDb.Task_Assignment.count.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('09:45 giữ đủ cầu cho lịch 10:00 và để walk-in ngắn tiếp tục WAITING', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-09T02:45:00.000Z')); // 09:45 tại Việt Nam

    const walkInOrder = {
      id: 20,
      createdAt: new Date(),
      // Dù dự kiến xong lúc 09:55, hệ thống vẫn phải bảo vệ lịch 10:00.
      estimated_finish_time: new Date(Date.now() + 10 * 60 * 1000),
      appointment: { booking_type: 'WALK_IN_SPECIFIC', priority_type: 'NORMAL' },
      update: jest.fn(),
    };
    const scheduledStart = new Date('2026-08-09T03:00:00.000Z'); // 10:00 tại Việt Nam
    const reservedAppointments = Array.from({ length: 3 }, (_, index) => ({
      id: index + 1,
      booking_type: 'RECEPTIONIST_SPECIFIC',
      scheduled_time: scheduledStart,
      appointmentDetails: [{ catalog_id: 1 }],
      serviceOrder: null,
    }));

    mockDb.Service_Bays.findOne.mockResolvedValue({ id: 1 });
    mockDb.Service_Bays.count.mockResolvedValue(3);
    mockDb.Service_Orders.findAll.mockResolvedValue([walkInOrder]);
    mockDb.Appointments.findAll.mockResolvedValue(reservedAppointments);
    mockCalculateAppointmentTime.mockResolvedValue({
      endTime: new Date(scheduledStart.getTime() + 45 * 60 * 1000),
    });

    await assignQueuedOrders(transaction);

    expect(walkInOrder.update).not.toHaveBeenCalled();
    expect(mockDb.Service_Bays.update).not.toHaveBeenCalled();
    expect(mockDb.Task_Assignment.create).not.toHaveBeenCalled();
  });

  it('ưu tiên lệnh của lịch đặt trước trước walk-in trong hàng chờ', async () => {
    const walkInOrder = {
      id: 21,
      createdAt: new Date(Date.now() - 60_000),
      appointment: { booking_type: 'WALK_IN_SPECIFIC', priority_type: 'NORMAL' },
      update: jest.fn(),
    };
    const scheduledOrder = {
      id: 22,
      createdAt: new Date(),
      appointment: {
        booking_type: 'RECEPTIONIST_SPECIFIC',
        priority_type: 'NORMAL',
        scheduled_time: new Date(),
      },
      update: jest.fn(),
    };

    mockDb.Service_Bays.findOne
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce(null);
    mockDb.Service_Orders.findAll.mockResolvedValue([walkInOrder, scheduledOrder]);

    await assignQueuedOrders(transaction);

    expect(scheduledOrder.update).toHaveBeenCalledWith(
      { bay_id: 2, bay_status: 'ASSIGNED' },
      { transaction },
    );
    expect(walkInOrder.update).not.toHaveBeenCalled();
  });
});
