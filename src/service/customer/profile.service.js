const db = require("../../../models");
const User = db.User;
const { Op } = require("sequelize");
const { notifyRole } = require("../../util/notification.util");
const { normalizeVnPhone } = require("../../util/phone.util");
const bcrypt = require("bcrypt");
module.exports.getProfile = async (userId) => {
    const user = await User.findOne({
        where: { id: userId },
        attributes: { exclude: ["password", "refreshToken"] },
        include: [
            {
                model: db.Role,
                as: "role",
            },
            {
                model: db.Customers,
                as: "customerProfile",
                attributes: ["id", "membership_tier", "loyalty_points"],
                required: false
            },
        ],
    });

    if (!user) {
        throw { status: 404, message: "Người dùng không tồn tại" };
    }

    const customer = await db.Customers.findOne({
        where: { user_id: userId },
        attributes: ["id"],
    });

    let vehicles = [];
    if (customer) {
        vehicles = await db.Vehicles.findAll({
            where: { customer_id: customer.id },
            include: [
                {
                    model: db.Vehicle_Models,
                    as: "model",
                    attributes: ["id", "model_name", "vehicle_type"],
                    include: [
                        {
                            model: db.Vehicle_Makes,
                            as: "make",
                            attributes: ["id", "make_name"],
                        },
                    ],
                },
            ],
            order: [["createdAt", "DESC"]],
            attributes: ["id", "license_plate", "vin_number", "avg_daily_mileage", "year", "color", "createdAt", "updatedAt"],
        });
    }

    const profileData = user.toJSON();
    profileData.vehicles = vehicles;

    return profileData;
};


module.exports.updateProfile = async (userId, payload) => {
    const user = await User.findByPk(userId);
    if (!user) {
        throw { status: 404, message: "Người dùng không tồn tại" };
    }

    const updates = {};
    if (payload.fullName) updates.fullName = payload.fullName;
    if (payload.avatar) {
        updates.avatar = payload.avatar;
    }
    if (payload.email) {
        updates.email = payload.email;
    }
    if (payload.phoneNumber) {
        updates.phoneNumber = payload.phoneNumber;
    }

    await user.update(updates);

    const updated = await User.findOne({
        where: { id: userId },
        attributes: { exclude: ["password"] },
        include: [
            {
                model: db.Role,
                as: "role",
            },
        ],
    });

    return updated;
};
module.exports.changePassword = async (
    userId,
    currentPassword,
    newPassword,
) => {
    if (!userId) {
        throw { status: 401, message: "Unauthorized" };
    }

    const user = await User.findOne({ where: { id: userId } });
    if (!user) {
        throw { status: 404, message: "User not found" };
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        throw { status: 400, message: "Mật khẩu hiện tại không đúng" };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.refreshToken = null;
    await user.save();

    return { message: "Đổi mật khẩu thành công" };
};

module.exports.updateLocation = async (userId, latitude, longitude) => {
    if (!userId) {
        throw { status: 401, message: "Unauthorized" };
    }

    const user = await User.findByPk(userId);
    if (!user) {
        throw { status: 404, message: "Người dùng không tồn tại" };
    }

    if (latitude !== undefined) user.latitude = latitude;
    if (longitude !== undefined) user.longitude = longitude;

    await user.save();

    // Đồng bộ toạ độ mới sang bảng Rescue_Requests nếu Khách hàng đang có cuốc cứu hộ chưa hoàn thành
    if (latitude !== undefined && longitude !== undefined) {
        const customer = await db.Customers.findOne({ where: { user_id: userId } });
        if (customer) {
            const [updatedRows] = await db.Rescue_Requests.update(
                { customer_lat: latitude, customer_lng: longitude },
                {
                    where: {
                        customer_id: customer.id,
                        status: {
                            [Op.in]: ['PENDING', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']
                        }
                    }
                }
            );

            // Tự động tạo 1 yêu cầu Cứu hộ PENDING nếu khách hàng chưa có yêu cầu nào đang chạy
            if (updatedRows === 0) {
                await db.Rescue_Requests.create({
                    customer_id: customer.id,
                    status: 'PENDING',
                    customer_lat: latitude,
                    customer_lng: longitude
                });
            }
        }
    }

    if (latitude !== undefined && longitude !== undefined) {
        // Gửi thông báo đến Lễ Tân
        await notifyRole('RECEPTIONIST', {
            title: 'Khách hàng chia sẻ vị trí cứu hộ',
            content: `Khách hàng ${user.fullName || 'Một khách hàng'} vừa cập nhật vị trí yêu cầu cứu hộ!`,
            notificationType: 'SYSTEM',
            priority: 'HIGH',
            link: '/reception/customers'
        }, 'new_notification', { message: `Khách hàng ${user.fullName || ''} đang yêu cầu cứu hộ khẩn cấp!` });

        return { message: "Đã bật chia sẻ vị trí và thông báo cho bộ phận Lễ tân thành công" };
    }

    return { message: "Tắt chia sẻ vị trí thành công" };
};