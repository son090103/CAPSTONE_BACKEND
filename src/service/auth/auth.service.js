const db = require("../../../models");
/** @type {import("sequelize").ModelStatic<import("sequelize").Model>} */
const User = db.User;
const Role = db.Role;
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { normalizeVnPhone } = require("../../util/phone.util");
const { where } = require("sequelize");
const admin = require("../../config/firebase.config");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../../util/jwt.util");

module.exports.login = async (phone, password) => {
  const user = await User.findOne({
    where: {
      phoneNumber: phone,
    },
    include: [
      {
        model: db.Role,
        as: "role",
      },
    ],
  });

  if (!user) {
    throw {
      status: 404,
      message: "Số điện thoại hoặc Mật khẩu bị sai",
    };
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw {
      status: 404,
      message: "Số điện thoại hoặc Mật khẩu bị sai",
    };
  }

  switch (user.status) {
    case "PENDING":
      throw {
        status: 403,
        message:
          "Tài khoản chưa được kích hoạt. Vui lòng liên hệ quản trị viên.",
      };
    case "INACTIVE":
      throw {
        status: 403,
        message: "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
      };
    case "BANNED":
      throw {
        status: 403,
        message: "Tài khoản đã bị khóa vĩnh viễn.",
      };
    case "ACTIVE":
      break;
    default:
      throw {
        status: 403,
        message: "Trạng thái tài khoản không hợp lệ.",
      };
  }
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  user.refreshToken = refreshToken;
  await user.save();
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role?.roleCode,
      avatar: user.avatar,
      status: user.status,
    },
  };
};

module.exports.loginWithGoogle = async (profile) => {
  const googleId = profile.id;
  const email = profile.emails?.[0]?.value;
  const fullName = profile.displayName;
  const avatar = profile.photos?.[0]?.value || "";
  let user = await User.findOne({
    where: { googleId },
    include: [{ model: db.Role, as: "role" }],
  });
  if (!user) {
    const customerRole = await db.Role.findOne({
      where: { roleCode: "CUSTOMER" },
    });

    const created = await User.create({
      googleId,
      email,
      fullName,
      avatar,
      roleId: customerRole.id,
      status: "ACTIVE",
    });

    user = await User.findOne({
      where: { id: created.id },
      include: [{ model: db.Role, as: "role" }],
    });
  }
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  user.refreshToken = refreshToken;
  await user.save();
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      email: user.email,
      role: user.role?.roleCode,
      avatar: user.avatar,
      status: user.status,
    },
  };
};
module.exports.checkPhone = async (phone) => {
    const normalizePhone = await normalizeVnPhone(phone);
    if (!normalizePhone) {
        throw {
            status: 400,
            message: "Số điện thoại không hợp lệ, vui lòng thử lại"
        };
    }; 
    const user = await User.findOne({
        where: {phoneNumber: normalizePhone}
    });
    if (user && user.status == "ACTIVE"){
         throw {
            status: 400,
            message: "Người dùng đã tồn tại trong hệ thống, vui lòng đăng nhập"
        };
    }
};
module.exports.register = async (
  idToken,
  fullName,
  password,
  confirmPassword,
) => {
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
    console.log("token: ", decoded);
  } catch (error) {
    console.log("VERIFY ERROR:", error);
    throw {
      status: 401,
      message: "OTP không hợp lệ hoặc đã hết hạn",
    };
  }
  const firebasePhoneNumber = decoded.phone_number;
  if (!firebasePhoneNumber) {
    throw {
      status: 400,
      message: "Token không chứa số điện thoại",
    };
  }
  const normalizePhone = await normalizeVnPhone(firebasePhoneNumber);
  if (!normalizePhone) {
    throw {
      status: 400,
      message: "Số điện thoại không hợp lệ, vui lòng thử lại",
    };
  }
  if (password !== confirmPassword) {
    throw {
      status: 400,
      message: "Mật khẩu xác nhận không trùng khớp",
    };
  }
  const existingUser = await User.findOne({
    where: { phoneNumber: normalizePhone },
  });
  if (existingUser && existingUser.status == "ACTIVE") {
    throw {
      status: 400,
      message: "Số điện thoại đã được đăng kí.",
    };
  }
  const role = await Role.findOne({ where: { roleCode: "CUSTOMER" } });
  if (!role) {
    throw {
      status: 400,
      message: "Không tìm thấy vai trò trong db",
    };
  }
  const hashPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    fullName: fullName,
    phoneNumber: normalizePhone,
    password: hashPassword,
    status: "ACTIVE",
    roleId: role.id,
  });
  return user;
};

module.exports.processRefreshToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new Error("NO_TOKEN");
  }
  try {
    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_KEY);
    const currentUser = await User.findOne({
      where: { refreshToken: refreshToken },
    });
    if (!currentUser) {
      throw new Error("USER_NOT_EXIST");
    }
    const accessToken = jwt.sign(
      { userId: currentUser.id },
      process.env.ACCESS_TOKEN_KEY,
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
      },
    );
    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  } catch (error) {
    throw new Error("INVALID_TOKEN");
  }
};

module.exports.logout = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw {
      status: 404,
      message: "Không tìm thấy tài khoản",
    };
  }
  user.refreshToken = null;
  await user.save();
  return {
    message: "Đăng xuất thành công",
  };
};

module.exports.forgotPassword = async (phone, password, confirmPassword) => {
  const normalizePhone = await normalizeVnPhone(phone);
  if (!normalizePhone) {
    throw {
      status: 400,
      message: "Số điện thoại không hợp lệ, vui lòng thử lại",
    };
  }
  if (password !== confirmPassword) {
    throw {
      status: 400,
      message: "Mật khẩu xác nhận không trùng khớp",
    };
  }
  const user = await User.findOne({
    where: { phoneNumber: normalizePhone },
  });
  if (!user) {
    throw {
      status: 404,
      message: "Không tìm thấy tài khoản liên kết với số điện thoại này",
    };
  }
  const hashPassword = await bcrypt.hash(password, 10);
  user.password = hashPassword;
  user.refreshToken = null;
  await user.save();
  return {
    message: "Đặt lại mật khẩu thành công",
  };
};
