const { changePasswordSchema, } = require("../../validation/auth/change-password-validation");
const profileService = require("../../service/customer/profile.service");
const { updateProfileSchema } = require("../../validation/customer/profile.validation");
const { generateOtp, storeOtp, verifyOtp, sendEmailOtp, sendPhoneOtp } = require("../../util/otp.util");
const { normalizeVnPhone } = require("../../util/phone.util");
const cloudinary = require("../../config/cloudinary.config");
const streamifier = require("streamifier");

module.exports.getProfile = async (req, res) => {
    try {
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const result = await profileService.getProfile(requestUser.id);
        return res.status(200).json({ message: "Lấy thông tin thành công", data: result });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
    }
};

module.exports.updateProfile = async (req, res) => {
    try {
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { fullName, avatar, email, phone, otpCode } = req.body;

        const payloadToValidate = {};
        if (typeof fullName === "string" && fullName.trim().length > 0) {
            payloadToValidate.fullName = fullName;
        }
        if (typeof avatar === "string" && avatar.trim().length > 0) {
            payloadToValidate.avatar = avatar;
        }
        if (typeof email === "string" && email.trim().length > 0) {
            payloadToValidate.email = email;
        }
        if (typeof phone === "string" && phone.trim().length > 0) {
            payloadToValidate.phone = phone;
        }
        if (typeof otpCode === "string" && otpCode.trim().length > 0) {
            payloadToValidate.otpCode = otpCode;
        }

        const validation = updateProfileSchema.safeParse(payloadToValidate);
        if (!validation.success) {
            return res.status(400).json({ message: validation.error.issues[0].message });
        }

        const payload = {};
        if (validation.data.fullName) payload.fullName = validation.data.fullName;

        if (validation.data.email) {
            if (requestUser.email) {
                return res.status(400).json({ message: "Email đã được thiết lập trước đó" });
            }
            if (!validation.data.otpCode) {
                const otp = generateOtp();
                storeOtp("email", validation.data.email, otp);
                await sendEmailOtp(validation.data.email, otp);
                return res.status(202).json({
                    message: "Vui lòng nhập mã OTP để xác thực email",
                    data: { email: validation.data.email },
                });
            }
            const isOtpValid = verifyOtp("email", validation.data.email, validation.data.otpCode);
            if (!isOtpValid) {
                return res.status(400).json({ message: "Mã OTP email không hợp lệ hoặc đã hết hạn" });
            }
            payload.email = validation.data.email;
        }

        if (validation.data.phone) {
            if (requestUser.phoneNumber) {
                return res.status(400).json({ message: "Số điện thoại đã được thiết lập trước đó" });
            }
            const normalizedPhone = normalizeVnPhone(validation.data.phone);
            if (!normalizedPhone) {
                return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
            }
            if (!validation.data.otpCode) {
                const otp = generateOtp();
                storeOtp("phone", normalizedPhone, otp);
                await sendPhoneOtp(normalizedPhone, otp);
                return res.status(202).json({
                    message: "Vui lòng nhập mã OTP để xác thực số điện thoại",
                    data: { phoneNumber: normalizedPhone },
                });
            }
            const isOtpValid = verifyOtp("phone", normalizedPhone, validation.data.otpCode);
            if (!isOtpValid) {
                return res.status(400).json({ message: "Mã OTP số điện thoại không hợp lệ hoặc đã hết hạn" });
            }
            payload.phoneNumber = normalizedPhone;
        }

        if (!payload.fullName && !payload.email && !payload.phoneNumber && !req.file && !avatar) {
            return res.status(400).json({ message: "Vui lòng cung cấp tên, email, số điện thoại hoặc avatar" });
        }

        let avatarData = validation.data.avatar ?? null;
        if (req.file) {
            try {
                const uploadResult = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: "WDP301" },
                        (error, result) => {
                            if (error) return reject(error);
                            resolve(result);
                        }
                    );
                    streamifier.createReadStream(req.file.buffer).pipe(stream);
                });

                if (!uploadResult?.secure_url) {
                    return res.status(400).json({ message: "Upload avatar thất bại" });
                }

                avatarData = uploadResult.secure_url;
            } catch (err) {
                console.error("CLOUDINARY ERROR:", err);
                return res.status(500).json({ message: "Lỗi upload avatar" });
            }
        }

        if (avatarData) payload.avatar = avatarData;

        const result = await profileService.updateProfile(requestUser.id, payload);

        return res.status(200).json({ message: "Cập nhật thông tin thành công", data: result });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
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
        const result = await profileService.changePassword(
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

module.exports.updateLocation = async (req, res) => {
    try {
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        let { latitude, longitude } = req.body;
        
        // Chuyển đổi sang số thực nếu có giá trị
        if (latitude !== null && latitude !== undefined) {
            latitude = parseFloat(latitude);
            if (isNaN(latitude)) {
                return res.status(400).json({ message: "Latitude phải là kiểu số hợp lệ" });
            }
        }
        
        if (longitude !== null && longitude !== undefined) {
            longitude = parseFloat(longitude);
            if (isNaN(longitude)) {
                return res.status(400).json({ message: "Longitude phải là kiểu số hợp lệ" });
            }
        }

        const result = await profileService.updateLocation(
            requestUser.id,
            latitude,
            longitude
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