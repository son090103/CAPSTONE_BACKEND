const db = require("../../../models");
const { notifyUser } = require("../../util/notification.util");

// module.exports.getTechniciansWorkingToday = async () => {
//     const today = new Date();
//     const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

//     //     // Lấy giờ hiện tại (HH:MM:SS) theo local time
//     //     const hh = String(today.getHours()).padStart(2, '0');
//     //     const mm = String(today.getMinutes()).padStart(2, '0');
//     //     const timeStr = `${hh}:${mm}:00`;
//     // Tìm các slot trực khớp với giờ hiện tại
//     const matchingSlots = await db.Shift_Slots.findAll({
//         where: {
//             is_active: true,
//             start_time: { [db.Sequelize.Op.lte]: timeStr },
//             end_time: { [db.Sequelize.Op.gte]: timeStr }
//         }
//     });

//     const slotIds = matchingSlots.map(s => s.id);
//     if (slotIds.length === 0) {
//         return []; // Nếu không khớp ca trực nào ở giờ hiện tại, trả về rỗng ngay lập tức
//     }

//     let whereCondition = {
//         work_date: todayStr,
//         is_confirmed: true,
//         slot_id: { [db.Sequelize.Op.in]: slotIds }
//     };

//     let shifts = await db.Shift_Templates.findAll({
//         where: whereCondition,
//         include: [
//             {
//                 model: db.User,
//                 as: 'user',
//                 attributes: ['id', 'fullName', 'phoneNumber', 'skillLevel', 'status', 'hasDrivingLicense'],
//                 where: {
//                     hasDrivingLicense: true
//                 },
//                 required: true,
//                 include: [
//                     {
//                         model: db.Role,
//                         as: 'role',
//                         attributes: ['roleName', 'roleCode']
//                     }
//                 ]
//             },
//             {
//                 model: db.Shift_Slots,
//                 as: 'shiftSlot'
//             }
//         ]
//     });

//     const technicianMap = new Map();
//     shifts.forEach(shift => {
//         const user = shift.user;
//         if (!user) return;

//         // Đảm bảo user hoạt động và là kĩ thuật viên
//         if (user.status !== 'ACTIVE') return;
//         if (user.role && !['TECHNICIAN', 'TECHNICIAN_LEADER'].includes(user.role.roleCode)) return;

//         if (!technicianMap.has(user.id)) {
//             technicianMap.set(user.id, {
//                 id: user.id,
//                 fullName: user.fullName,
//                 phoneNumber: user.phoneNumber,
//                 skillLevel: user.skillLevel,
//                 role: user.role,
//                 shifts: []
//             });
//         }
//         technicianMap.get(user.id).shifts.push(shift.shiftSlot);
//     });

//     return Array.from(technicianMap.values());
// };

module.exports.assignRescueTechnician = async (customerId, technicianId, customerLat, customerLng) => {
    let customer = await db.Customers.findByPk(customerId);
    if (!customer) {
        customer = await db.Customers.findOne({ where: { user_id: customerId } });
    }

    if (!customer) {
        throw new Error("Khách hàng không tồn tại trong hệ thống");
    }

    // Tìm xem khách hàng này có cuốc cứu hộ nào đang dang dở không
    let rescue = await db.Rescue_Requests.findOne({
        where: {
            customer_id: customer.id,
            status: {
                [db.Sequelize.Op.in]: ['PENDING', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']
            }
        }
    });

    if (rescue) {
        if (['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(rescue.status)) {
            throw new Error("Kỹ thuật viên đã tiếp nhận hoặc đang di chuyển cứu hộ. Không thể gán lại!");
        }
        // Cập nhật technician và status
        rescue.technician_id = technicianId;
        rescue.status = "ASSIGNED";
        if (customerLat && customerLng) {
            rescue.customer_lat = customerLat;
            rescue.customer_lng = customerLng;
        }
        await rescue.save();
    } else {
        // Tạo mới hoàn toàn nếu chưa có
        rescue = await db.Rescue_Requests.create({
            customer_id: customer.id,
            technician_id: technicianId,
            status: "ASSIGNED",
            customer_lat: customerLat || null,
            customer_lng: customerLng || null
        });
    }

    const technician = await db.User.findByPk(technicianId, { attributes: ["id", "fullName"] });

    await notifyUser(technicianId, {
        title: "Bạn được giao nhiệm vụ cứu hộ",
        content: `Bạn vừa được lễ tân giao 1 cuốc cứu hộ khẩn cấp. Vui lòng kiểm tra vị trí và lên đường.`,
        notificationType: "SYSTEM",
        priority: "HIGH",
        link: "/technician/rescue",
    }, "new_notification", { type: "RESCUE_ASSIGNED", rescueId: rescue.id });

    if (customer.user_id) {
        await notifyUser(customer.user_id, {
            title: "Kỹ thuật viên đã tiếp nhận cứu hộ",
            content: technician
                ? `Kỹ thuật viên ${technician.fullName} đã tiếp nhận yêu cầu cứu hộ của bạn và đang chuẩn bị lên đường.`
                : "Yêu cầu cứu hộ của bạn đã được tiếp nhận.",
            notificationType: "SYSTEM",
            priority: "HIGH",
        }, "new_notification", { type: "RESCUE_ASSIGNED", rescueId: rescue.id, status: rescue.status });
    }

    return rescue;
};
// bản make up v2
module.exports.getTechniciansWorkingToday = async () => {
    // FAKE DỮ LIỆU GIẢ ĐỂ TEST: Ngày 17/07 và Giờ 10:00 sáng (ca làm việc)
    const todayStr = '2026-07-17';
    const timeStr = '10:00:00';
    //logic thật
    // const today = new Date();
    //     const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    //     // Lấy giờ hiện tại (HH:MM:SS) theo local time
    //     const hh = String(today.getHours()).padStart(2, '0');
    //     const mm = String(today.getMinutes()).padStart(2, '0');
    //     const timeStr = `${hh}:${mm}:00`;
    // Tìm các slot trực khớp với giờ hiện tại
    const matchingSlots = await db.Shift_Slots.findAll({
        where: {
            is_active: true,
            start_time: { [db.Sequelize.Op.lte]: timeStr },
            end_time: { [db.Sequelize.Op.gte]: timeStr }
        }
    });

    const slotIds = matchingSlots.map(s => s.id);
    if (slotIds.length === 0) {
        return []; // Nếu không khớp ca trực nào ở giờ hiện tại, trả về rỗng ngay lập tức
    }

    let whereCondition = {
        work_date: todayStr,
        is_confirmed: true,
        slot_id: { [db.Sequelize.Op.in]: slotIds }
    };

    let shifts = await db.Shift_Templates.findAll({
        where: whereCondition,
        include: [
            {
                model: db.User,
                as: 'user',
                attributes: ['id', 'fullName', 'phoneNumber', 'skillLevel', 'status', 'hasDrivingLicense'],
                where: {
                    hasDrivingLicense: true
                },
                required: true,
                include: [
                    {
                        model: db.Role,
                        as: 'role',
                        attributes: ['roleName', 'roleCode']
                    }
                ]
            },
            {
                model: db.Shift_Slots,
                as: 'shiftSlot'
            }
        ]
    });

    const technicianMap = new Map();
    shifts.forEach(shift => {
        const user = shift.user;
        if (!user) return;

        // Đảm bảo user hoạt động và là kĩ thuật viên
        if (user.status !== 'ACTIVE') return;
        if (user.role && !['TECHNICIAN', 'TECHNICIAN_LEADER'].includes(user.role.roleCode)) return;

        if (!technicianMap.has(user.id)) {
            technicianMap.set(user.id, {
                id: user.id,
                fullName: user.fullName,
                phoneNumber: user.phoneNumber,
                skillLevel: user.skillLevel,
                role: user.role,
                shifts: []
            });
        }
        technicianMap.get(user.id).shifts.push(shift.shiftSlot);
    });

    return Array.from(technicianMap.values());
};

module.exports.createRescueRequest = async (data) => {
    const { phone_number, customer_lat, customer_lng, distance_km, rescue_price, issue_description, technician_id, customer_name } = data;

    if (!phone_number) {
        throw new Error("Số điện thoại không được để trống");
    }

    // 1. Tìm hoặc tạo hồ sơ khách hàng trong table Customers
    let customer = await db.Customers.findOne({ where: { phone: phone_number } });
    const user = await db.User.findOne({ where: { phoneNumber: phone_number } });

    if (!customer && user) {
        customer = await db.Customers.findOne({ where: { user_id: user.id } });
    }

    if (!customer) {
        customer = await db.Customers.create({
            name: customer_name || "Khách vãng lai",
            phone: phone_number,
            user_id: user ? user.id : null,
            membership_tier: "BRONZE",
            loyalty_points: 0,
            total_spent: 0
        });
    } else {
        if (customer.name === "Khách vãng lai" && customer_name && customer_name !== "Khách vãng lai") {
            customer.name = customer_name;
            await customer.save();
        }
    }

    const customerId = customer.id;
    const customerUserId = user ? user.id : null;

    const rescue = await db.Rescue_Requests.create({
        customer_id: customerId,
        phone_number: phone_number,
        customer_lat: customer_lat || null,
        customer_lng: customer_lng || null,
        distance_km: distance_km || 0,
        rescue_price: rescue_price || 0,
        issue_description: issue_description || "Yêu cầu cứu hộ khẩn cấp",
        technician_id: technician_id || null,
        status: technician_id ? "ASSIGNED" : "PENDING"
    });

    if (technician_id) {
        const technician = await db.User.findByPk(technician_id, { attributes: ["id", "fullName"] });

        await notifyUser(technician_id, {
            title: "Bạn được giao nhiệm vụ cứu hộ",
            content: `Bạn vừa được lễ tân giao 1 cuốc cứu hộ khẩn cấp. Vui lòng kiểm tra vị trí và lên đường.`,
            notificationType: "SYSTEM",
            priority: "HIGH",
            link: "/technician/rescue",
        }, "new_notification", { type: "RESCUE_ASSIGNED", rescueId: rescue.id });

        if (customerUserId) {
            await notifyUser(customerUserId, {
                title: "Kỹ thuật viên đã tiếp nhận cứu hộ",
                content: technician
                    ? `Kỹ thuật viên ${technician.fullName} đã tiếp nhận yêu cầu cứu hộ của bạn và đang chuẩn bị lên đường.`
                    : "Yêu cầu cứu hộ của bạn đã được tiếp nhận.",
                notificationType: "SYSTEM",
                priority: "HIGH",
            }, "new_notification", { type: "RESCUE_ASSIGNED", rescueId: rescue.id, status: rescue.status });
        }
    }

    return rescue;
};