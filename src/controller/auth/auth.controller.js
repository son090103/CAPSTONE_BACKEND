const { loginSchema, registerSchema, checkPhoneSchema, forgotPasswordSchema } = require("./../../validation/auth/auth.validation");
const authService = require("./../../service/auth/auth.service");
const profileService = require("../../service/customer/profile.service");
const { da } = require("zod/v4/locales");

module.exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const validation = loginSchema.safeParse({ phone, password });
      if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    }
    const result = await authService.login(phone, password);
    return res.status(200).json({
      message: "Đăng nhập thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};
exports.googleCallback = async (req, res) => {
  try {
    const profile = req.user; 
    const result = await authService.loginWithGoogle(profile);

    const userParam = encodeURIComponent(JSON.stringify(result.user));

    res.redirect(
      `${process.env.FRONTEND_URL}/oauth-success` +
        `?accessToken=${result.accessToken}` +
        `&refreshToken=${result.refreshToken}` +
        `&user=${userParam}`
    );
  } catch (error) {
    console.error("Google login error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=google_failed`);
  }
};

module.exports.checkPhone = async (req,res) => {
    try {
        const {phone} = req.body;
        const validation = checkPhoneSchema.safeParse({phone});
        await authService.checkPhone(phone);
         return res.status(200).json({
            message: "",
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            code: error.code,
            message: error.message || "Internal server error"
        });
    }
}


module.exports.register = async (req,res) => {
    try {
        const {idToken, fullName, password, confirmPassword} = req.body;
        const validation = registerSchema.safeParse({fullName, password});
        if (!validation.success) {
            return res.status(400).json({
                message: validation.error.issues[0].message
            });
        }
        const result = await authService.register(idToken, fullName, password, confirmPassword)
        return res.status(200).json({
            message: "Đăng kí thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Internal server error"
        });
    }
};
module.exports.refreshToken = async (req, res) => {
  const refreshToken = req.body.refreshToken; 
  try {
    const result = await authService.processRefreshToken(refreshToken);
    return res.status(200).json({
      state: 200,
      message: "Success",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    console.error("Lỗi tại api refresh-token:", error.message);
    return res.status(401).json({
      state: 401,
      message: "Unauthorized", 
    });
  }
};

module.exports.changePassword = async (req, res) => {
  try {
    const requestUser = res.locals.user;
    if (!requestUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const validation = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmNewPassword,
    });
    if (!validation.success) {
      return res
        .status(400)
        .json({ message: validation.error.issues[0].message });
    }
    const result = await authService.changePassword(
      requestUser.id,
      validation.data.currentPassword,
      validation.data.newPassword,
    );
    return res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.logout = async (req, res) => {
  try {
    const requestUser = res.locals.user;
    if (!requestUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const result = await authService.logout(requestUser.id);
    return res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.forgotPassword = async (req, res) => {
  try {
    const { phone, password, confirmPassword } = req.body;
    const validation = forgotPasswordSchema.safeParse({ password });
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    }
    const result = await authService.forgotPassword(phone, password, confirmPassword);
    return res.status(200).json({
      message: "Đặt lại mật khẩu thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getProfile = async (req, res) => {
  try {
    const requestUser = res.locals.user;
    if (!requestUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const result = await profileService.getProfile(requestUser.id);
    return res.status(200).json({
      message: "Get profile success",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};