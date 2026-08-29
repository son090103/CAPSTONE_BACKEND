const db = require("../../../models");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const { normalizeVnPhone } = require("../../util/phone.util");

const User = db.User;
const Role = db.Role;

const generateTempPassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < 10; i += 1) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  return password;
};

module.exports.getStaffList = async ({ page = 1, limit = 20, search, roleCode }) => {
  const pageNumber = Number(page) > 0 ? Number(page) : 1;
  const pageSize = Number(limit) > 0 ? Number(limit) : 20;
  const offset = (pageNumber - 1) * pageSize;

  const userWhere = {};
  if (search && String(search).trim()) {
    const searchValue = `%${String(search).trim()}%`;
    userWhere[Op.or] = [
      { fullName: { [Op.like]: searchValue } },
      { phoneNumber: { [Op.like]: searchValue } },
    ];
  }

  const roleFilter = {
    roleCode: {
      [Op.notIn]: ["CUSTOMER", "ADMIN"],
    },
  };
  if (roleCode && String(roleCode).trim()) {
    roleFilter.roleCode = String(roleCode).trim();
  }

  const result = await User.findAndCountAll({
    where: userWhere,
    include: [
      {
        model: Role,
        as: "role",
        where: roleFilter,
        attributes: ["id", "roleCode", "roleName"],
      },
    ],
    attributes: ["id", "fullName", "phoneNumber", "status", "avatar", "createdAt"],
    order: [
      [
        db.sequelize.literal(`CASE 
          WHEN "role"."roleCode" = 'TECHNICIAN_LEADER' THEN 1 
          WHEN "role"."roleCode" = 'TECHNICIAN' THEN 2 
          WHEN "role"."roleCode" = 'RECEPTIONIST' THEN 3 
          ELSE 4 
        END`),
        'ASC'
      ],
      ['createdAt', 'DESC']
    ],
    limit: pageSize,
    offset,
  });

  return {
    data: result.rows,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total: result.count,
      totalPages: Math.ceil(result.count / pageSize),
    },
  };
};

module.exports.createStaff = async ({ fullName, phoneNumber, roleCode, password, avatar }) => {
  const normalizedPhone = await normalizeVnPhone(phoneNumber);
  if (!normalizedPhone) {
    throw { status: 400, message: "Số điện thoại không hợp lệ" };
  }

  const existingPhone = await User.findOne({ where: { phoneNumber: normalizedPhone } });
  if (existingPhone) {
    throw { status: 400, message: "Số điện thoại đã tồn tại" };
  }

  const role = await Role.findOne({ where: { roleCode: roleCode.trim() } });
  if (!role) {
    throw { status: 400, message: "Vai trò không hợp lệ" };
  }

  const tempPassword = password || generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  const user = await User.create({
    fullName: fullName.trim(),
    phoneNumber: normalizedPhone,
    password: hashedPassword,
    roleId: role.id,
    status: "ACTIVE",
    avatar: avatar || null,
  });

  const createdUser = await User.findOne({
    where: { id: user.id },
    attributes: ["id", "fullName", "phoneNumber", "status", "avatar", "createdAt"],
    include: [
      {
        model: Role,
        as: "role",
        attributes: ["id", "roleCode"],
      },
    ],
  });

  return { user: createdUser, tempPassword };
};

module.exports.updateStaff = async (userId, payload) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw { status: 404, message: "Nhân viên không tồn tại" };
  }

  const updates = {};

  if (payload.fullName) {
    updates.fullName = payload.fullName.trim();
  }

  if (payload.phoneNumber) {
    const normalizedPhone = await normalizeVnPhone(payload.phoneNumber);
    if (!normalizedPhone) {
      throw { status: 400, message: "Số điện thoại không hợp lệ" };
    }

    const existingPhone = await User.findOne({
      where: {
        phoneNumber: normalizedPhone,
        id: { [Op.ne]: user.id },
      },
    });
    if (existingPhone) {
      throw { status: 400, message: "Số điện thoại đã tồn tại" };
    }

    updates.phoneNumber = normalizedPhone;
  }

  if (payload.roleCode) {
    const role = await Role.findOne({ where: { roleCode: payload.roleCode.trim() } });
    if (!role) {
      throw { status: 400, message: "Vai trò không hợp lệ" };
    }
    updates.roleId = role.id;
  }

  if (payload.status) {
    updates.status = payload.status.trim().toUpperCase();
  }

  if (payload.avatar !== undefined) {
    updates.avatar = payload.avatar;
  }

  if (Object.keys(updates).length === 0) {
    throw { status: 400, message: "Vui lòng cung cấp ít nhất một trường để cập nhật" };
  }

  await user.update(updates);

  const updatedUser = await User.findOne({
    where: { id: user.id },
    attributes: ["id", "fullName", "phoneNumber", "status", "avatar", "createdAt"],
    include: [
      {
        model: Role,
        as: "role",
        attributes: ["id", "roleCode"],
      },
    ],
  });

  return updatedUser;
};


module.exports.getRoles = async (req, res) => {
  const roles = await Role.findAll({
    attributes: ['id', 'roleCode', 'roleName']
  });
  return roles
};

module.exports.getStaffPerformanceList = async (timeframe) => {
  try {
    const staffMembers = await User.findAll({
      attributes: ["id", "fullName", "phoneNumber", "status", "avatar", "createdAt"],
      include: [
        {
          model: Role,
          as: "role",
          attributes: ["id", "roleCode", "roleName"],
          where: {
            roleCode: ["RECEPTIONIST", "TECHNICIAN", "TECHNICIAN_LEADER"]
          }
        },
      ],
      where: {
        status: { [Op.ne]: "DELETED" }
      },
    });

    const results = [];
    for (const member of staffMembers) {
      const memberId = member.id;
      const roleCode = member.role?.roleCode;

      // 1. Completed Tasks count
      let completedTasks = 0;
      if (roleCode === 'TECHNICIAN' || roleCode === 'TECHNICIAN_LEADER') {
        completedTasks = await db.Task_Assignment.count({
          where: {
            technician_id: memberId,
            status: 'COMPLETED'
          }
        });
      } else if (roleCode === 'RECEPTIONIST') {
        completedTasks = await db.Service_Orders.count({
          where: {
            receptionist_id: memberId,
            status: 'COMPLETED'
          }
        });
      }

      // 2. Revenue Contribution
      let revenueContribution = 0;
      if (roleCode === 'TECHNICIAN' || roleCode === 'TECHNICIAN_LEADER') {
        const queryRes = await db.sequelize.query(`
          SELECT COALESCE(SUM(q.total_amount), 0) AS revenue
          FROM "Task_Assignments" ta
          JOIN "Tasks" t ON t.id = ta.task_id
          JOIN "Quotations" q ON q.task_id = t.id AND q.status = 'APPROVED'
          WHERE ta.technician_id = :memberId AND ta.status = 'COMPLETED'
        `, {
          replacements: { memberId },
          type: db.sequelize.QueryTypes.SELECT
        });
        revenueContribution = Number(queryRes[0]?.revenue || 0);
      } else if (roleCode === 'RECEPTIONIST') {
        const queryRes = await db.sequelize.query(`
          SELECT COALESCE(SUM(q.total_amount), 0) AS revenue
          FROM "Service_Orders" so
          JOIN "Tasks" t ON t.service_order_id = so.id
          JOIN "Quotations" q ON q.task_id = t.id AND q.status = 'APPROVED'
          WHERE so.receptionist_id = :memberId AND so.status = 'COMPLETED'
        `, {
          replacements: { memberId },
          type: db.sequelize.QueryTypes.SELECT
        });
        revenueContribution = Number(queryRes[0]?.revenue || 0);
      }

      // 3. Average Rating
      let rating = 0;
      let feedbackCount = 0;
      if (roleCode === 'TECHNICIAN_LEADER') {
        const ratingRes = await db.Feedback.findOne({
          attributes: [
            [db.sequelize.fn('AVG', db.sequelize.col('head_technician_rating')), 'avgRating'],
            [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
          ],
          where: { head_technician_id: memberId }
        });
        const avg = ratingRes?.getDataValue('avgRating');
        rating = avg !== null && avg !== undefined ? Number(avg) : 0;
        feedbackCount = Number(ratingRes?.getDataValue('count') || 0);
      } else if (roleCode === 'RECEPTIONIST') {
        const ratingRes = await db.Feedback.findOne({
          attributes: [
            [db.sequelize.fn('AVG', db.sequelize.col('receptionist_rating')), 'avgRating'],
            [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
          ],
          where: { receptionist_id: memberId }
        });
        const avg = ratingRes?.getDataValue('avgRating');
        rating = avg !== null && avg !== undefined ? Number(avg) : 0;
        feedbackCount = Number(ratingRes?.getDataValue('count') || 0);
      } else {
        const ratingRes = await db.sequelize.query(`
          SELECT AVG(f.service_rating) AS "avgRating", COUNT(f.id) AS count
          FROM "Feedbacks" f
          JOIN "Tasks" t ON t.service_order_id = f.service_order_id
          JOIN "Task_Assignments" ta ON ta.task_id = t.id
          WHERE ta.technician_id = :memberId
        `, {
          replacements: { memberId },
          type: db.sequelize.QueryTypes.SELECT
        });
        const avg = ratingRes[0]?.avgRating;
        rating = avg !== null && avg !== undefined ? Number(avg) : 0;
        feedbackCount = Number(ratingRes[0]?.count || 0);
      }

      rating = Number(Number(rating).toFixed(1));

      results.push({
        id: memberId,
        fullName: member.fullName,
        phoneNumber: member.phoneNumber,
        status: member.status,
        avatar: member.avatar || null,
        createdAt: member.createdAt,
        roleName: member.role?.roleName || "Nhân viên",
        roleCode: member.role?.roleCode,
        completedTasks,
        revenueContribution,
        rating,
        feedbackCount
      });
    }

    return results;
  } catch (error) {
    throw new Error(error.message);
  }
};

module.exports.getStaffFeedbacks = async (userId) => {
  try {
    const user = await User.findOne({
      where: { id: userId },
      include: [{ model: Role, as: "role", attributes: ["roleCode"] }]
    });

    if (!user) {
      throw new Error("Không tìm thấy nhân sự");
    }

    const roleCode = user.role?.roleCode;
    let feedbacks = [];

    if (roleCode === 'TECHNICIAN_LEADER') {
      feedbacks = await db.Feedback.findAll({
        where: { head_technician_id: userId },
        include: [
          { model: db.Customers, as: 'customer', attributes: ['name', 'phone'] },
          { model: db.Service_Orders, as: 'serviceOrder', attributes: ['id'] }
        ],
        order: [['createdAt', 'DESC']]
      });
    } else if (roleCode === 'RECEPTIONIST') {
      feedbacks = await db.Feedback.findAll({
        where: { receptionist_id: userId },
        include: [
          { model: db.Customers, as: 'customer', attributes: ['name', 'phone'] },
          { model: db.Service_Orders, as: 'serviceOrder', attributes: ['id'] }
        ],
        order: [['createdAt', 'DESC']]
      });
    } else {
      feedbacks = await db.Feedback.findAll({
        include: [
          { model: db.Customers, as: 'customer', attributes: ['name', 'phone'] },
          {
            model: db.Service_Orders,
            as: 'serviceOrder',
            attributes: ['id'],
            required: true,
            include: [{
              model: db.Task,
              as: 'tasks',
              required: true,
              include: [{
                model: db.Task_Assignment,
                as: 'assignments',
                where: { technician_id: userId },
                required: true
              }]
            }]
          }
        ],
        order: [['createdAt', 'DESC']]
      });
    }

    return feedbacks.map(fb => {
      let ratingValue = fb.rating;
      let commentValue = fb.comment;

      if (roleCode === 'TECHNICIAN_LEADER') {
        ratingValue = fb.head_technician_rating !== null && fb.head_technician_rating !== undefined ? fb.head_technician_rating : 0;
        commentValue = fb.head_technician_comment || 'Không có bình luận.';
      } else if (roleCode === 'RECEPTIONIST') {
        ratingValue = fb.receptionist_rating !== null && fb.receptionist_rating !== undefined ? fb.receptionist_rating : 0;
        commentValue = fb.receptionist_comment || 'Không có bình luận.';
      } else {
        ratingValue = fb.service_rating !== null && fb.service_rating !== undefined ? fb.service_rating : 0;
        commentValue = fb.service_comment || 'Không có bình luận.';
      }

      return {
        id: fb.id,
        customerName: fb.customer?.name || 'Khách hàng',
        customerPhone: fb.customer?.phone || '',
        rating: ratingValue,
        comment: commentValue,
        serviceOrderId: fb.serviceOrder?.id || fb.service_order_id,
        createdAt: fb.createdAt
      };
    });
  } catch (error) {
    throw new Error(error.message);
  }
};
