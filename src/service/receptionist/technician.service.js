const db = require("../../../models");
const { notifyUser } = require("../../util/notification.util");

const ACTIVE_RESCUE_STATUSES = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'TOWING'];
const MAX_RESCUE_DISTANCE_KM = 40;

const ensureTechnicianCanBeAssignedToRescue = async (technicianId, excludedRescueId = null) => {
    const workingTechnicians = await module.exports.getTechniciansWorkingToday();
    const technician = workingTechnicians.find(item => item.id === Number(technicianId));
    if (!technician) {
        throw { status: 400, message: "Kỹ thuật viên không hoạt động, không đúng vai trò hoặc không đủ điều kiện lái xe cứu hộ" };
    }

    const activeRescue = await db.Rescue_Requests.findOne({
        where: {
            technician_id: technicianId,
            status: { [db.Sequelize.Op.in]: ACTIVE_RESCUE_STATUSES },
            ...(excludedRescueId ? { id: { [db.Sequelize.Op.ne]: excludedRescueId } } : {})
        }
    });
    if (activeRescue) {
        throw { status: 400, message: "Kỹ thuật viên đang thực hiện một cuốc cứu hộ khác" };
    }
};

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
                [db.Sequelize.Op.in]: ACTIVE_RESCUE_STATUSES
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

    await ensureTechnicianCanBeAssignedToRescue(technicianId, rescue?.id || null);

    if (rescue) {
        if (['EN_ROUTE', 'ARRIVED', 'TOWING', 'COMPLETED'].includes(rescue.status)) {
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
            title: "Đã phân công kỹ thuật viên cứu hộ",
            content: technician
                ? `Kỹ thuật viên ${technician.fullName} đã được phân công xử lý yêu cầu cứu hộ của bạn.`
                : "Yêu cầu cứu hộ của bạn đã được phân công.",
            notificationType: "SYSTEM",
            priority: "HIGH",
        }, "new_notification", { type: "RESCUE_ASSIGNED", rescueId: rescue.id, status: rescue.status });
    }

    return rescue;
};
module.exports.getTechniciansWorkingToday = async () => {
    // Cứu hộ không phụ thuộc lịch Shift_Templates. Lấy trực tiếp mọi tài khoản kỹ thuật
    // đang hoạt động và có bằng lái; lễ tân quyết định người phù hợp dựa trên trạng thái bận/rảnh.
    const technicians = await db.User.findAll({
        attributes: ['id', 'fullName', 'phoneNumber', 'skillLevel', 'status', 'hasDrivingLicense'],
        where: {
            status: 'ACTIVE',
            hasDrivingLicense: true
        },
        include: [
            {
                model: db.Role,
                as: 'role',
                attributes: ['roleName', 'roleCode'],
                where: {
                    roleCode: { [db.Sequelize.Op.in]: ['TECHNICIAN', 'TECHNICIAN_LEADER'] }
                },
                required: true,
            }
        ],
        order: [['fullName', 'ASC']]
    });

    const technicianList = technicians.map(technician => technician.toJSON());
    const technicianIds = technicianList.map(technician => technician.id);
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
                        model: db.Service_Catalog,
                        as: 'catalog',
                        attributes: ['id', 'service_name']
                    },
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
            serviceName: assignment.task?.catalog?.service_name || null,
            serviceOrderId: assignment.task?.serviceOrder?.id || null,
            vehiclePlate: assignment.task?.serviceOrder?.vehicle?.license_plate || null,
        });
        assignmentsByTechnician.set(assignment.technician_id, list);
    });

    return technicianList.map(technician => {
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

    if (distance_km != null && Number(distance_km) > MAX_RESCUE_DISTANCE_KM) {
        throw { status: 400, message: `Khoảng cách cứu hộ vượt quá ${MAX_RESCUE_DISTANCE_KM}km, không thể tạo dịch vụ.` };
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

    let rescue = await db.Rescue_Requests.findOne({
        where: {
            customer_id: customerId,
            status: { [db.Sequelize.Op.in]: ACTIVE_RESCUE_STATUSES }
        },
        order: [['createdAt', 'DESC']]
    });

    if (technician_id) {
        await ensureTechnicianCanBeAssignedToRescue(technician_id, rescue?.id || null);
    }

    if (rescue) {
        if (!['PENDING', 'ASSIGNED'].includes(rescue.status)) {
            throw { status: 400, message: "Khách hàng đang có một cuốc cứu hộ được thực hiện" };
        }
        rescue.phone_number = phone_number;
        rescue.customer_lat = customer_lat ?? rescue.customer_lat;
        rescue.customer_lng = customer_lng ?? rescue.customer_lng;
        rescue.distance_km = distance_km ?? rescue.distance_km;
        rescue.rescue_price = rescue_price ?? rescue.rescue_price;
        rescue.issue_description = issue_description || rescue.issue_description || "Yêu cầu cứu hộ khẩn cấp";
        if (technician_id) {
            rescue.technician_id = technician_id;
            rescue.status = 'ASSIGNED';
        }
        await rescue.save();
    } else {
        rescue = await db.Rescue_Requests.create({
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
    }

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
                title: "Đã phân công kỹ thuật viên cứu hộ",
                content: technician
                    ? `Kỹ thuật viên ${technician.fullName} đã được phân công xử lý yêu cầu cứu hộ của bạn.`
                    : "Yêu cầu cứu hộ của bạn đã được phân công.",
                notificationType: "SYSTEM",
                priority: "HIGH",
            }, "new_notification", { type: "RESCUE_ASSIGNED", rescueId: rescue.id, status: rescue.status });
        }
    }

    return rescue;
};

module.exports.cancelRescueRequest = async (rescueId, cancelReason) => {
    if (!cancelReason || !cancelReason.trim()) {
        throw { status: 400, message: "Vui lòng nhập lý do hủy cứu hộ" };
    }

    const rescue = await db.Rescue_Requests.findByPk(rescueId, {
        include: [{ model: db.Customers, as: "customer" }],
    });
    if (!rescue) {
        throw { status: 404, message: "Không tìm thấy yêu cầu cứu hộ" };
    }
    if (!ACTIVE_RESCUE_STATUSES.includes(rescue.status)) {
        throw { status: 400, message: "Yêu cầu cứu hộ này không còn ở trạng thái có thể hủy" };
    }

    const technicianId = rescue.technician_id;
    rescue.status = "CANCELLED";
    rescue.cancel_reason = cancelReason.trim();
    await rescue.save();

    if (technicianId) {
        await notifyUser(technicianId, {
            title: "Cuốc cứu hộ đã bị hủy",
            content: `Lễ tân đã hủy cuốc cứu hộ bạn đang phụ trách. Lý do: ${rescue.cancel_reason}`,
            notificationType: "SYSTEM",
            priority: "HIGH",
            link: "/technician/rescue",
        }, "new_notification", { type: "RESCUE_CANCELLED", rescueId: rescue.id });
    }

    if (rescue.customer?.user_id) {
        await notifyUser(rescue.customer.user_id, {
            title: "Yêu cầu cứu hộ đã bị hủy",
            content: `Yêu cầu cứu hộ của bạn đã bị hủy. Lý do: ${rescue.cancel_reason}`,
            notificationType: "SYSTEM",
            priority: "HIGH",
        }, "new_notification", { type: "RESCUE_CANCELLED", rescueId: rescue.id });
    }

    return rescue;
};
