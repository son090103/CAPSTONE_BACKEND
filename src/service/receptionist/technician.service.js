const db = require("../../../models");
const { notifyUser } = require("../../util/notification.util");

module.exports.assignRescueTechnician = async (customerId, technicianId, customerLat, customerLng) => {
    let customer = await db.Customers.findByPk(customerId);
    if (!customer) {
        customer = await db.Customers.findOne({ where: { user_id: customerId } });
    }

    if (!customer) {
        throw new Error("Khách hàng không tồn tại trong hệ thống");
    }

    // Tìm xem khách hàng này có cuốc cứu hộ nào đang dang dở không
    const activeRescues = await db.Rescue_Requests.findAll({
        where: {
            customer_id: customer.id,
            status: {
                [db.Sequelize.Op.in]: ['PENDING', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'TOWING', 'IN_PROGRESS']
            }
        },
        order: [['createdAt', 'DESC']]
    });

    let rescue = activeRescues[0];

    if (activeRescues.length > 1) {
        const otherIds = activeRescues.slice(1).map(r => r.id);
        await db.Rescue_Requests.update(
            { status: 'CANCELLED' },
            {
                where: { id: { [db.Sequelize.Op.in]: otherIds } }
            }
        );
    }

    if (rescue) {
        if (['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'TOWING', 'IN_PROGRESS', 'COMPLETED'].includes(rescue.status)) {
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
module.exports.getTechniciansWorkingToday = async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Không lọc theo giờ hiện tại nữa — chỉ cần KTV có ca đã xác nhận trong hôm nay, bất kể
    // giờ đó đã bắt đầu/kết thúc hay chưa.
    let whereCondition = {
        work_date: todayStr,
        is_confirmed: true
    };

    let shifts = await db.Shift_Templates.findAll({
        where: whereCondition,
        include: [
            {
                model: db.User,
                as: 'user',
                // Cứu hộ bắt buộc phải lái xe đi — chỉ lấy KTV có bằng lái, không hiển thị
                // người không đủ điều kiện thay vì để lễ tân tự cân nhắc.
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
                hasDrivingLicense: user.hasDrivingLicense,
                role: user.role,
                shifts: []
            });
        }
        technicianMap.get(user.id).shifts.push(shift.shiftSlot);
    });

    const technicianIds = Array.from(technicianMap.keys());
    if (technicianIds.length === 0) {
        return [];
    }

    // Lấy công việc đang dang dở của từng KTV để lễ tân biết ai đang bận/rảnh trước khi gán cứu hộ.
    const activeAssignments = await db.Task_Assignment.findAll({
        where: {
            technician_id: { [db.Sequelize.Op.in]: technicianIds },
            status: { [db.Sequelize.Op.in]: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'WAITING_STOCK'] }
        },
        attributes: ['id', 'technician_id', 'status'],
        include: [
            {
                model: db.Task,
                as: 'task',
                attributes: ['id', 'type'],
                include: [
                    {
                        model: db.Service_Orders,
                        as: 'serviceOrder',
                        attributes: ['id'],
                        include: [
                            {
                                model: db.Vehicles,
                                as: 'vehicle',
                                attributes: ['id', 'license_plate'],
                            }
                        ]
                    }
                ]
            }
        ]
    });

    const assignmentsByTechnician = new Map();
    activeAssignments.forEach(assignment => {
        const list = assignmentsByTechnician.get(assignment.technician_id) || [];
        list.push({
            id: assignment.id,
            status: assignment.status,
            taskType: assignment.task?.type || null,
            serviceOrderId: assignment.task?.serviceOrder?.id || null,
            vehiclePlate: assignment.task?.serviceOrder?.vehicle?.license_plate || null,
        });
        assignmentsByTechnician.set(assignment.technician_id, list);
    });

    return Array.from(technicianMap.values()).map(technician => {
        const currentTasks = assignmentsByTechnician.get(technician.id) || [];
        return {
            ...technician,
            isBusy: currentTasks.length > 0,
            currentTasks,
        };
    });
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