const db = require("../../../models");
const User = db.User;
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