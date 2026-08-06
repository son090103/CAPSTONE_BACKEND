const db = require("../../../models");
const { notifyUser } = require("../../util/notification.util");

module.exports.getTechniciansWorkingToday = async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const shifts = await db.Shift_Templates.findAll({
        where: {
            work_date: todayStr,
            is_confirmed: true
        },
        include: [
            {
                model: db.User,
                as: 'user',
                attributes: ['id', 'fullName', 'phoneNumber', 'skillLevel', 'status'],
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

        // Ensure user is active and has a technician role
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

module.exports.assignRescueTechnician = async (customerId, technicianId, customerLat, customerLng) => {
    let customer = await db.Customers.findOne({ where: { user_id: customerId } });
    if (!customer) {
        customer = await db.Customers.findByPk(customerId);
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
