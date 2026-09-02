const db = require("../../../models");
const Feedback = db.Feedback;
const Service_Orders = db.Service_Orders;
const Customers = db.Customers;

module.exports.submitFeedback = async (customerId, feedbackData) => {
  const serviceOrderId = feedbackData.service_order_id;
  const serviceOrder = await Service_Orders.findOne({
    where: { id: serviceOrderId },
    include: [
      {
        model: db.Appointments,
        as: 'appointment',
        attributes: ['id', 'customer_id']
      },
      {
        model: db.Vehicles,
        as: 'vehicle',
        attributes: ['id']
      }
    ]
  });

  if (!serviceOrder) {
    throw { status: 404, message: "Đơn hàng dịch vụ không tồn tại" };
  }

  if (serviceOrder.appointment && serviceOrder.appointment.customer_id !== customerId) {
    throw { status: 403, message: "Bạn không có quyền gửi phản hồi cho đơn hàng này" };
  }

  if (serviceOrder.status !== 'COMPLETED') {
    throw { status: 400, message: "Chỉ có thể gửi phản hồi khi dịch vụ đã hoàn thành" };
  }

  const existingFeedback = await Feedback.findOne({
    where: {
      customer_id: customerId,
      service_order_id: serviceOrderId
    }
  });

  if (existingFeedback) {
    throw { status: 400, message: "Bạn đã gửi phản hồi cho đơn hàng này rồi" };
  }

  const techLeaderRole = await db.Role.findOne({ where: { roleCode: 'TECHNICIAN_LEADER' } });
  let headTech = null;
  if (techLeaderRole) {
    headTech = await db.User.findOne({
      where: { roleId: techLeaderRole.id, status: 'ACTIVE' }
    });
  }

  const feedback = await Feedback.create({
    customer_id: customerId,
    service_order_id: serviceOrderId,
    rating: feedbackData.service_rating,
    comment: feedbackData.service_comment,
    service_rating: feedbackData.service_rating,
    service_comment: feedbackData.service_comment,
    receptionist_rating: feedbackData.receptionist_rating,
    receptionist_comment: feedbackData.receptionist_comment,
    receptionist_id: serviceOrder.receptionist_id,
    head_technician_rating: feedbackData.head_technician_rating,
    head_technician_comment: feedbackData.head_technician_comment,
    head_technician_id: headTech ? headTech.id : null
  });

  const createdFeedback = await Feedback.findOne({
    where: { id: feedback.id },
    attributes: [
      'id', 'customer_id', 'service_order_id', 'rating', 'comment', 
      'service_rating', 'service_comment', 
      'receptionist_rating', 'receptionist_comment', 'receptionist_id', 
      'head_technician_rating', 'head_technician_comment', 'head_technician_id', 
      'createdAt', 'updatedAt'
    ],
    include: [
      {
        model: Service_Orders,
        as: 'serviceOrder',
        attributes: ['id', 'appointment_id', 'vehicle_id', 'status', 'actual_finish_time']
      }
    ]
  });

  return createdFeedback;
};

module.exports.getCustomerFeedbacks = async (customerId) => {
  const feedbacks = await Feedback.findAll({
    where: { customer_id: customerId },
    attributes: [
      'id', 'customer_id', 'service_order_id', 'rating', 'comment', 
      'service_rating', 'service_comment', 
      'receptionist_rating', 'receptionist_comment', 'receptionist_id', 
      'head_technician_rating', 'head_technician_comment', 'head_technician_id', 
      'createdAt', 'updatedAt'
    ],
    include: [
      {
        model: Service_Orders,
        as: 'serviceOrder',
        attributes: ['id', 'appointment_id', 'vehicle_id', 'status', 'actual_finish_time']
      }
    ],
    order: [['createdAt', 'DESC']]
  });

  return feedbacks;
};

module.exports.getAllFeedbacks = async () => {
  const feedbacks = await Feedback.findAll({
    attributes: [
      'id', 'customer_id', 'service_order_id', 'rating', 'comment', 
      'service_rating', 'service_comment', 
      'receptionist_rating', 'receptionist_comment', 'receptionist_id', 
      'head_technician_rating', 'head_technician_comment', 'head_technician_id', 
      'createdAt', 'updatedAt'
    ],
    include: [
      {
        model: db.Customers,
        as: 'customer',
        attributes: ['id', 'name', 'phone', 'email']
      },
      {
        // Lễ tân xem lại đánh giá cần biết đánh giá thuộc xe nào và dịch vụ nào,
        // nên kèm luôn biển số xe và danh sách công việc đã làm trong đơn.
        model: Service_Orders,
        as: 'serviceOrder',
        attributes: ['id', 'appointment_id', 'vehicle_id', 'status', 'actual_finish_time'],
        include: [
          {
            model: db.Vehicles,
            as: 'vehicle',
            attributes: ['id', 'license_plate', 'color'],
            required: false,
            include: [
              {
                model: db.Vehicle_Models,
                as: 'model',
                attributes: ['id', 'model_name'],
                required: false,
                include: [
                  { model: db.Vehicle_Makes, as: 'make', attributes: ['id', 'make_name'], required: false }
                ]
              }
            ]
          },
          {
            model: db.Task,
            as: 'tasks',
            attributes: ['id', 'type', 'status'],
            required: false,
            include: [
              { model: db.Service_Catalog, as: 'catalog', attributes: ['id', 'service_name'], required: false }
            ]
          }
        ]
      },
      {
        model: db.User,
        as: 'receptionist',
        attributes: ['id', 'fullName']
      },
      {
        model: db.User,
        as: 'headTechnician',
        attributes: ['id', 'fullName']
      }
    ],
    order: [['createdAt', 'DESC']]
  });

  return feedbacks;
};
