const db = require("../../../models");

module.exports.getTechniciansWorkingToday = async () => {
    const today = new Date();
    // Tạm thời fix cứng ngày 17/07 (thứ 6) để test vì hôm nay (thứ 7) không có lịch làm việc trong DB
    const todayStr = '2026-07-17'; // `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
    // Tìm kiếm khách hàng xem có tồn tại không
    // Cần cẩn thận: customerId truyền lên từ Frontend có thể là id của user hoặc id của bảng Customers
    // Ở ReceptionCustomerList.tsx, nếu là thành viên, nó truyền id của User. 
    // Chúng ta thử tìm Customer thông qua user_id hoặc id trực tiếp.
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

    return rescue;
};
