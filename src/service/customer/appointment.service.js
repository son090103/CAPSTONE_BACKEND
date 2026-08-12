const db = require("../../../models");
const { Op } = require("sequelize");
const getGarageCapacity = require("../../util/getGarageCapacity.util");
const { notifyRole } = require("../../util/notification.util");

module.exports.getAppointments = async (userId) => {
    let customer = await db.Customers.findOne({ where: { user_id: userId } });
    if (!customer) {
        const user = await db.User.findByPk(userId);
        if (!user) {
            throw { status: 404, message: "Hồ sơ khách hàng không tồn tại" };
        }
        customer = await db.Customers.create({
            user_id: userId,
            phone: user.phoneNumber || '0000000000',
            membership_tier: 'BRONZE',
            loyalty_points: 0
        });
    }

    const appointments = await db.Appointments.findAll({
        where: {
            customer_id: customer.id,
            status: { [Op.ne]: 'PENDING' }
        },
        include: [
            {
                model: db.Vehicles,
                as: 'vehicle',
                attributes: ['id', 'license_plate', 'vin_number', 'color', 'year'],
                include: [
                    {
                        model: db.Vehicle_Models,
                        as: 'model',
                        attributes: ['id', 'model_name', 'vehicle_type'],
                        include: [
                            {
                                model: db.Vehicle_Makes,
                                as: 'make',
                                attributes: ['id', 'make_name']
                            }
                        ]
                    }
                ]
            },
            {
                model: db.Appointment_Details,
                as: 'appointmentDetails',
                include: [
                    {
                        model: db.Service_Catalog,
                        as: 'catalog',
                        attributes: ['id', 'service_name', 'estimated_duration', 'description', 'labor_price', 'spare_part_id'],
                        include: [
                            {
                                model: db.Spare_Parts,
                                as: 'sparePart',
                                attributes: ['id', 'retail_price']
                            }
                        ]
                    },
                    {
                        model: db.Service_Combo,
                        as: 'combo',
                        attributes: ['id', 'combo_name', 'description'],
                        include: [
                            {
                                model: db.Service_Catalog,
                                as: 'catalogs',
                                attributes: ['id', 'service_name', 'labor_price', 'spare_part_id'],
                                include: [
                                    {
                                        model: db.Spare_Parts,
                                        as: 'sparePart',
                                        attributes: ['id', 'retail_price']
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                model: db.Service_Orders,
                as: 'serviceOrder',
                attributes: ['id', 'status'],
                required: false,
                include: [
                    {
                        model: db.Service_Bays,
                        as: 'bay',
                        attributes: ['bay_name']
                    },
                    {
                        model: db.User,
                        as: 'receptionist',
                        attributes: ['fullName']
                    }
                ]
            }
        ],
        order: [['scheduled_time', 'DESC']]
    });

    return appointments;
};

// Đặt lịch hẹn: chỉ giữ chỗ (Appointment + Appointment_Details), KHÔNG tạo Service_Order/Task/Quotation
// và KHÔNG chiếm cầu nâng/gán KTV — vì xe chưa thực sự có mặt tại garage. Service_Order chỉ được tạo
// sau khi khách đến và lễ tân bấm "Tiếp nhận" (receiveAppointment).
module.exports.createAppointment = async (userId, data) => {
    // Kiểm tra sức chứa của gara
    const capacityData = await getGarageCapacity();
    const capacity = capacityData.maxCapacity;

    if (capacity === 0) {
        throw { status: 400, message: "Garage hiện tại không có khả năng tiếp nhận thêm xe (thiếu nhân sự hoặc khoang sửa chữa)." };
    }

    const allDetails = [];
    if (data.details && data.details.length > 0) {
        allDetails.push(...data.details);
    }
    if (data.service_ids && data.service_ids.length > 0) {
        for (const id of data.service_ids) {
            allDetails.push({ catalog_id: id });
        }
    }
    if (data.combo_ids && data.combo_ids.length > 0) {
        for (const id of data.combo_ids) {
            allDetails.push({ combo_id: id });
        }
    }

    // Nếu đặt lịch sửa chữa (REPAIR), tự động thêm dịch vụ kiểm tra (labor_price = 0)
    if (data.booking_type && data.booking_type.includes('REPAIR')) {
        const freeCheckupService = await db.Service_Catalog.findOne({
            where: { labor_price: 0, is_active: true }
        });
        if (freeCheckupService) {
            const existing = allDetails.find(d => d.catalog_id === freeCheckupService.id);
            if (!existing) {
                allDetails.push({ catalog_id: freeCheckupService.id });
            }
        }
    }

    if (allDetails.length > 0) {
        for (const detail of allDetails) {
            if (detail.catalog_id) {
                const catalog = await db.Service_Catalog.findByPk(detail.catalog_id);
                if (!catalog) {
                    throw { status: 400, message: `Dịch vụ lẻ với ID ${detail.catalog_id} không tồn tại` };
                }
            }
            if (detail.combo_id) {
                const combo = await db.Service_Combo.findByPk(detail.combo_id);
                if (!combo) {
                    throw { status: 400, message: `Gói dịch vụ (combo) với ID ${detail.combo_id} không tồn tại` };
                }
            }
        }
    }

    // Kiểm tra lấn giờ (Overlap Validation)
    const { calculateAppointmentTime } = require("../../util/calculateAppointmentTime.util");
    const garageConfigService = require("../common/garage_configurations.service");

    const targetDate = new Date(data.scheduled_time);
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const availability = await garageConfigService.getAvailability(dateStr);
    const bookedCounts = availability.bookedCounts || {};

    const { endTime } = await calculateAppointmentTime(allDetails, targetDate);
    const startHour = targetDate.getUTCHours();
    let endHour = endTime.getUTCHours();

    if (endHour < startHour) {
        endHour += 24;
    }
    if (endTime.getMinutes() === 0 && endHour > startHour) {
        endHour -= 1;
    }

    for (let h = startHour; h <= endHour; h++) {
        const hourKey = h % 24;
        if ((bookedCounts[hourKey] || 0) >= capacity) {
            throw { status: 400, message: `Khung giờ này không đủ thời gian trống liền mạch cho các dịch vụ bạn đã chọn. Vui lòng chọn giờ khác!` };
        }
    }

    let customer = await db.Customers.findOne({ where: { user_id: userId } });
    if (!customer) {
        const user = await db.User.findByPk(userId);
        if (!user) {
            throw { status: 404, message: "Hồ sơ khách hàng không tồn tại" };
        }
        customer = await db.Customers.create({
            user_id: userId,
            phone: user.phoneNumber || '0000000000',
            membership_tier: 'BRONZE',
            loyalty_points: 0
        });
    }

    const transaction = await db.sequelize.transaction();
    try {
        let resolvedVehicleId = data.vehicle_id || null;

        if (!resolvedVehicleId && data.vehicle_plate) {
            const normalizedPlate = data.vehicle_plate.trim().toUpperCase();
            const duplicateVehicle = await db.Vehicles.findOne({
                where: db.sequelize.where(
                    db.sequelize.fn('UPPER', db.sequelize.col('license_plate')),
                    normalizedPlate
                ),
                transaction
            });
            if (duplicateVehicle) {
                throw {
                    status: 409,
                    message: duplicateVehicle.customer_id === customer.id
                        ? `Biển số ${normalizedPlate} đã có trong danh sách xe của anh/chị. Vui lòng chọn xe đã có thay vì thêm xe mới.`
                        : `Biển số ${normalizedPlate} đã thuộc một tài khoản khác. Vui lòng kiểm tra lại biển số hoặc liên hệ gara để xác minh.`
                };
            }

            let make = null;
            if (data.vehicle_brand) {
                const brandName = data.vehicle_brand.trim();
                make = await db.Vehicle_Makes.findOne({
                    where: db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('make_name')), brandName.toLowerCase()),
                    transaction
                });
                if (!make) {
                    make = await db.Vehicle_Makes.create({ make_name: brandName }, { transaction });
                }
            } else {
                make = await db.Vehicle_Makes.findOne({
                    where: { make_name: 'Khác' },
                    transaction
                });
                if (!make) {
                    make = await db.Vehicle_Makes.create({ make_name: 'Khác' }, { transaction });
                }
            }

            let modelName = data.vehicle_model ? data.vehicle_model.trim() : 'Khác';
            let model = await db.Vehicle_Models.findOne({
                where: {
                    make_id: make.id,
                    [db.Sequelize.Op.and]: [
                        db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('model_name')), modelName.toLowerCase())
                    ]
                },
                transaction
            });
            if (!model) {
                model = await db.Vehicle_Models.create({
                    make_id: make.id,
                    model_name: modelName,
                    vehicle_type: 'Sedan'
                }, { transaction });
            }

            const vehicle = await db.Vehicles.create({
                customer_id: customer.id,
                model_id: model.id,
                license_plate: normalizedPlate,
                year: data.vehicle_year ? parseInt(data.vehicle_year, 10) : new Date().getFullYear(),
                color: data.vehicle_color || null,
                avg_daily_mileage: 0.0
            }, { transaction });

            resolvedVehicleId = vehicle.id;
        } else if (resolvedVehicleId) {
            const vehicle = await db.Vehicles.findOne({
                where: { id: resolvedVehicleId, customer_id: customer.id },
                transaction
            });
            if (!vehicle) {
                throw { status: 400, message: "Xe không tồn tại hoặc không thuộc sở hữu của khách hàng này" };
            }
        }

        let initialStatus = 'CONFIRMED';
        if (data.payment_amount && Number(data.payment_amount) > 0) {
            initialStatus = 'PENDING';
        }

        const appointment = await db.Appointments.create({
            customer_id: customer.id,
            vehicle_id: resolvedVehicleId,
            booking_type: data.booking_type,
            scheduled_time: new Date(data.scheduled_time),
            notes: data.notes || null,
            status: initialStatus
        }, { transaction });

        if (allDetails.length > 0) {
            const detailsToCreate = allDetails.map(d => ({
                appointment_id: appointment.id,
                catalog_id: d.catalog_id || null,
                combo_id: d.combo_id || null
            }));
            await db.Appointment_Details.bulkCreate(detailsToCreate, { transaction });
        }

        await transaction.commit();

        // --- Bắt đầu: Xử lý Socket và Thông báo cho Lễ tân ---
        const requestUser = await db.User.findByPk(userId);
        await notifyRole('RECEPTIONIST', {
            title: "Lịch hẹn mới",
            content: `Khách hàng ${requestUser ? (requestUser.fullName || requestUser.phoneNumber) : 'Vô danh'} vừa đặt lịch hẹn.`,
            notificationType: 'APPOINTMENT',
            referenceId: appointment.id,
            link: `/reception/appointments/${appointment.id}`
        }, 'new_notification', {
            message: "Có lịch hẹn mới",
            appointmentId: appointment.id,
            type: "APPOINTMENT"
        });
        // --- Kết thúc xử lý thông báo ---

        return await db.Appointments.findByPk(appointment.id, {
            include: [
                {
                    model: db.Vehicles,
                    as: 'vehicle',
                    attributes: ['id', 'license_plate', 'vin_number', 'color', 'year'],
                    include: [
                        {
                            model: db.Vehicle_Models,
                            as: 'model',
                            attributes: ['id', 'model_name', 'vehicle_type'],
                            include: [
                                {
                                    model: db.Vehicle_Makes,
                                    as: 'make',
                                    attributes: ['id', 'make_name']
                                }
                            ]
                        }
                    ]
                },
                {
                    model: db.Appointment_Details,
                    as: 'appointmentDetails',
                    include: [
                        {
                            model: db.Service_Catalog,
                            as: 'catalog',
                            attributes: ['id', 'service_name', 'estimated_duration', 'description', 'labor_price', 'spare_part_id'],
                            include: [
                                {
                                    model: db.Spare_Parts,
                                    as: 'sparePart',
                                    attributes: ['id', 'retail_price']
                                }
                            ]
                        },
                        {
                            model: db.Service_Combo,
                            as: 'combo',
                            attributes: ['id', 'combo_name', 'description'],
                            include: [
                                {
                                    model: db.Service_Catalog,
                                    as: 'catalogs',
                                    attributes: ['id', 'service_name', 'labor_price', 'spare_part_id'],
                                    include: [
                                        {
                                            model: db.Spare_Parts,
                                            as: 'sparePart',
                                            attributes: ['id', 'retail_price']
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

module.exports.deleteAppointment = async (userId, appointmentId) => {
    const customer = await db.Customers.findOne({ where: { user_id: userId } });
    if (!customer) {
        throw { status: 404, message: "Hồ sơ khách hàng không tồn tại" };
    }

    const appointment = await db.Appointments.findOne({
        where: { id: appointmentId, customer_id: customer.id }
    });

    if (!appointment) {
        throw { status: 404, message: "Lịch hẹn không tồn tại hoặc không thuộc quyền sở hữu của bạn" };
    }

    if (appointment.status !== 'PENDING' && appointment.status !== 'CONFIRMED') {
        throw { status: 400, message: `Không thể xóa hoặc hủy lịch hẹn khi đã ở trạng thái: ${appointment.status}` };
    }

    await appointment.destroy();
    return { message: "Xóa lịch hẹn thành công" };
};

module.exports.cancelAppointment = async (userId, appointmentId) => {
    const customer = await db.Customers.findOne({ where: { user_id: userId } });
    if (!customer) {
        throw { status: 404, message: "Hồ sơ khách hàng không tồn tại" };
    }

    const appointment = await db.Appointments.findOne({
        where: { id: appointmentId, customer_id: customer.id }
    });

    if (!appointment) {
        throw { status: 404, message: "Lịch hẹn không tồn tại hoặc không thuộc quyền sở hữu của bạn" };
    }

    if (appointment.status !== 'PENDING' && appointment.status !== 'CONFIRMED') {
        throw { status: 400, message: `Không thể hủy lịch hẹn khi đã ở trạng thái: ${appointment.status}` };
    }

    appointment.status = 'CANCELLED';
    await appointment.save();
    return { message: "Hủy lịch hẹn thành công", data: appointment };
};

module.exports.getAppointmentVehicles = async (userId) => {
    const customer = await db.Customers.findOne({ where: { user_id: userId } });
    if (!customer) {
        throw { status: 404, message: "Hồ sơ khách hàng không tồn tại" };
    }

    // Lấy tất cả xe của khách hàng
    const vehicles = await db.Vehicles.findAll({
        where: { customer_id: customer.id },
        include: [
            {
                model: db.Vehicle_Models,
                as: 'model',
                attributes: ['id', 'model_name', 'vehicle_type'],
                include: [
                    {
                        model: db.Vehicle_Makes,
                        as: 'make',
                        attributes: ['id', 'make_name']
                    }
                ]
            }
        ]
    });

    if (!vehicles || vehicles.length === 0) return [];

    const availableVehicles = [];

    for (const vehicle of vehicles) {
        // Khóa xe khi đã có lịch đang chờ hoặc xe đã được lễ tân tiếp nhận tại gara.
        const activeAppointment = await db.Appointments.findOne({
            where: {
                vehicle_id: vehicle.id,
                status: {
                    [db.Sequelize.Op.in]: [
                        'PENDING',
                        'CONFIRMED',
                        'INFORMATION_RECEIVED'
                    ]
                }
            },
            order: [['created_at', 'DESC']]
        });

        // Kiểm tra xem xe có đang nằm trong xưởng sửa chữa không
        const activeServiceOrder = await db.Service_Orders.findOne({
            where: {
                vehicle_id: vehicle.id,
                status: { [db.Sequelize.Op.in]: ['INSPECTING', 'WAITING_FOR_PARTS', 'IN_PROGRESS'] }
            },
            include: [{
                model: db.Appointments,
                as: 'appointment',
                required: false
            }]
        });

        const isServiceOrderActive = activeServiceOrder && (
            !activeServiceOrder.appointment ||
            activeServiceOrder.appointment.status !== 'PENDING'
        );

        const vehicleData = vehicle.toJSON();

        if (activeAppointment) {
            vehicleData.isDisabled = true;
            const hasArrivedAtGarage = activeAppointment.status === 'INFORMATION_RECEIVED';
            vehicleData.disableReason = hasArrivedAtGarage
                ? 'Xe đã được tiếp nhận tại gara'
                : 'Xe đang có lịch hẹn chờ xử lý';
        } else if (isServiceOrderActive) {
            vehicleData.isDisabled = true;
            vehicleData.disableReason = 'Xe đang được sửa tại xưởng';
        } else {
            vehicleData.isDisabled = false;
        }

        availableVehicles.push(vehicleData);
    }

    return availableVehicles;
};
