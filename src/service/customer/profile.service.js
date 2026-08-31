const db = require("../../../models");
const User = db.User;
const { Op } = require("sequelize");
const { notifyRole, notifyUser } = require("../../util/notification.util");
const { normalizeVnPhone } = require("../../util/phone.util");
const bcrypt = require("bcrypt");

// Giữ đồng bộ với luồng lễ tân (technician.service.js) — cùng giới hạn phạm vi cứu hộ tối đa,
// và cùng toạ độ Gara cố định với FE (MapTracking.tsx: garageLocation).
const MAX_RESCUE_DISTANCE_KM = 40;
const GARAGE_LAT = 15.9675;
const GARAGE_LNG = 108.2605;

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports.getActiveRescueTracking = async (userId) => {
    const customer = await db.Customers.findOne({ where: { user_id: userId } });
    if (!customer) return null;

    const rescue = await db.Rescue_Requests.findOne({
        where: {
            customer_id: customer.id,
            status: { [Op.in]: ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'TOWING'] }
        },
        include: [{
            model: db.User,
            as: 'technician',
            attributes: ['id', 'fullName', 'latitude', 'longitude']
        }],
        order: [['createdAt', 'DESC']]
    });
    if (!rescue) return null;

    return {
        rescueId: rescue.id,
        status: rescue.status,
        customerLat: rescue.customer_lat,
        customerLng: rescue.customer_lng,
        technician: rescue.technician || null
    };
};

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
                attributes: ["id", "membership_tier", "loyalty_points", "total_spent"],
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

module.exports.updateLocation = async (userId, latitude, longitude, contactName, contactPhone) => {
    if (!userId) {
        throw { status: 401, message: "Unauthorized" };
    }

    const user = await User.findByPk(userId);
    if (!user) {
        throw { status: 404, message: "Người dùng không tồn tại" };
    }

    // Chặn ở BE ngoài validate FE (MapTracking.tsx) — tránh khách hàng gọi thẳng API bỏ qua
    // giới hạn phạm vi cứu hộ, giống cách luồng lễ tân đã chặn ở technician.service.js.
    if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
        const distanceKm = haversineDistanceKm(GARAGE_LAT, GARAGE_LNG, latitude, longitude);
        if (distanceKm > MAX_RESCUE_DISTANCE_KM) {
            throw { status: 400, message: `Khoảng cách cứu hộ vượt quá ${MAX_RESCUE_DISTANCE_KM}km, không thể gửi yêu cầu.` };
        }
    }

    if (latitude !== undefined) user.latitude = latitude;
    if (longitude !== undefined) user.longitude = longitude;

    await user.save();

    // Đồng bộ toạ độ mới sang bảng Rescue_Requests nếu Khách hàng đang có cuốc cứu hộ chưa hoàn thành
    let isNewRescueRequest = false;
    let newRescueId = null;
    if (latitude !== undefined && longitude !== undefined) {
        const customer = await db.Customers.findOne({ where: { user_id: userId } });
        if (customer) {
            // Người liên hệ có thể khác chủ tài khoản (vd người nhà gọi hộ) — giống cách lễ tân
            // xử lý ở createRescueRequest: tên cập nhật thẳng vào Customers.name, SĐT lưu riêng
            // vào Rescue_Requests.phone_number (không đổi Customers.phone/User.phoneNumber gốc).
            if (contactName && contactName.trim() && contactName.trim() !== customer.name) {
                customer.name = contactName.trim();
                await customer.save();
            }
            const rescuePhone = (contactPhone && contactPhone.trim()) || user.phoneNumber || null;

            const [updatedRows] = await db.Rescue_Requests.update(
                { customer_lat: latitude, customer_lng: longitude, phone_number: rescuePhone },
                {
                    where: {
                        customer_id: customer.id,
                        status: {
                            [Op.in]: ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'TOWING']
                        }
                    }
                }
            );

            // Tự động tạo 1 yêu cầu Cứu hộ PENDING nếu khách hàng chưa có yêu cầu nào đang chạy
            if (updatedRows === 0) {
                const newRescue = await db.Rescue_Requests.create({
                    customer_id: customer.id,
                    status: 'PENDING',
                    customer_lat: latitude,
                    customer_lng: longitude,
                    phone_number: rescuePhone
                });
                isNewRescueRequest = true;
                newRescueId = newRescue.id;
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

        // Chỉ tự confirm lại cho khách khi đây là yêu cầu MỚI (PENDING lần đầu) — nếu họ chỉ đang
        // cập nhật toạ độ của 1 rescue đã có (đã ASSIGNED/EN_ROUTE...) thì không cần báo lại "đã gửi".
        if (isNewRescueRequest) {
            await notifyUser(userId, {
                title: "Yêu cầu cứu hộ đã được gửi",
                content: "Yêu cầu cứu hộ khẩn cấp của bạn đã được gửi tới Gara, vui lòng đợi lễ tân tiếp nhận.",
                notificationType: "SYSTEM",
                priority: "HIGH",
            }, "new_notification", { type: "RESCUE_REQUESTED", rescueId: newRescueId, status: "PENDING" });
        }

        if (!newRescueId) {
            const customer = await db.Customers.findOne({ where: { user_id: userId } });
            const activeRescue = customer ? await db.Rescue_Requests.findOne({
                where: {
                    customer_id: customer.id,
                    status: { [Op.in]: ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'TOWING'] }
                },
                order: [['createdAt', 'DESC']]
            }) : null;
            newRescueId = activeRescue?.id || null;
        }

        return {
            message: "Đã bật chia sẻ vị trí và thông báo cho bộ phận Lễ tân thành công",
            rescueId: newRescueId
        };
    }

    return { message: "Tắt chia sẻ vị trí thành công" };
};
