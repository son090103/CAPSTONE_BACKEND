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
    attributes: ["id", "fullName", "phoneNumber", "status", "createdAt"],
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

module.exports.createStaff = async ({ fullName, phoneNumber, roleCode, password }) => {
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
  });

  const createdUser = await User.findOne({
    where: { id: user.id },
    attributes: ["id", "fullName", "phoneNumber", "status", "createdAt"],
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

  if (Object.keys(updates).length === 0) {
    throw { status: 400, message: "Vui lòng cung cấp ít nhất một trường để cập nhật" };
  }

  await user.update(updates);

  const updatedUser = await User.findOne({
    where: { id: user.id },
    attributes: ["id", "fullName", "phoneNumber", "status", "createdAt"],
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
