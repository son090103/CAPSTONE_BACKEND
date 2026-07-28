const db = require("../../../models");

module.exports.getRepairProgress = async (userId) => {
  const customer = await db.Customers.findOne({ where: { user_id: userId } });
  if (!customer) {
    throw { status: 404, message: "Không tìm thấy thông tin khách hàng" };
  };
  const orders = await db.Service_Orders.findAll({
    attributes: [
      "id",
      "status",
      "entry_time",
      "promised_finish_time",
      "actual_finish_time",
    ],
    include: [
      {
        model: db.Vehicles,
        as: "vehicle",
        attributes: ["id", "license_plate", "color"],
        where: { customer_id: customer.id },
        required: true,
        include: [
          {
            model: db.Vehicle_Models,
            as: "model",
            attributes: ["id", "model_name"],
          },
        ],
      },
      {
        model: db.Task,
        as: "tasks",
        attributes: ["id", "status"],
        required: false,
        include: [
          {
            model: db.Task_Assignment,
            as: "assignments",
            attributes: ["id", "status"],
            required: false,
          },
        ],
      },
    ],
    order: [["entry_time", "DESC"]],
  });

  return orders;
};
