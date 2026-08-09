const db = require("../../../models");

module.exports.getAppointment = async () => {
    const appointments = await db.Appointments.findAll({
        where: {
            status: { [db.Sequelize.Op.ne]: 'PENDING' }
        },
        include: [
            {
                model: db.Customers,
                as: 'customer',
                attributes: ['id', 'name', 'phone', 'membership_tier'],
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['id', 'fullName', 'phoneNumber']
                    }
                ]
            },
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
                        attributes: ['id', 'service_name', 'estimated_duration', 'description']
                    },
                    {
                        model: db.Service_Combo,
                        as: 'combo',
                        attributes: ['id', 'combo_name', 'description'],
                        include: [
                            {
                                model: db.Service_Catalog,
                                as: 'catalogs',
                                attributes: ['id', 'service_name'],
                                through: { attributes: [] }
                            }
                        ]
                    }
                ]
            },
            {
                model: db.Service_Orders,
                as: 'serviceOrder',
                attributes: ['id', 'current_odo', 'bay_id', 'bay_status']
            }
        ],
        order: [[db.Sequelize.literal('COALESCE("Appointments"."scheduled_time", "Appointments"."created_at")'), 'ASC']]
    });

    return appointments;
};

module.exports.getCustomer = async (searchParams = "") => {
    try {
        let whereCondition = {};
        if (searchParams) {
            whereCondition = {
                [db.Sequelize.Op.or]: [
                    { name: { [db.Sequelize.Op.like]: `%${searchParams}%` } },
                    { phone: { [db.Sequelize.Op.like]: `%${searchParams}%` } }
                ]
            };
        }

        const customers = await db.Customers.findAll({
            where: whereCondition,
            include: [
                {
                    model: db.User,
                    as: 'user',
                    attributes: ['id', 'fullName', 'phoneNumber', 'avatar', 'status', 'latitude', 'longitude'],
                    required: false
                },
                {
                    model: db.Rescue_Requests,
                    as: 'rescueRequests',
                    required: true,
                    include: [
                        {
                            model: db.User,
                            as: 'technician',
                            attributes: ['id', 'fullName', 'phoneNumber', 'avatar'],
                            required: false
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const registeredCustomers = customers.filter(c => c.user_id !== null);
        
        // Tìm các cuốc cứu hộ chưa được liên kết customer_id (dữ liệu cũ hoặc chưa tạo kịp hồ sơ)
        let unlinkedWhere = { customer_id: null };
        if (searchParams) {
            unlinkedWhere.phone_number = { [db.Sequelize.Op.like]: `%${searchParams}%` };
        }
        const unlinkedRescues = await db.Rescue_Requests.findAll({
            where: unlinkedWhere,
            include: [
                {
                    model: db.User,
                    as: 'technician',
                    attributes: ['id', 'fullName', 'phoneNumber', 'avatar'],
                    required: false
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const mockGuestCustomers = unlinkedRescues.map(rescue => {
            return {
                id: `guest-rescue-${rescue.id}`,
                name: "Khách vãng lai",
                phone: rescue.phone_number || "Không có SĐT",
                user: null,
                createdAt: rescue.createdAt,
                rescueRequests: [rescue]
            };
        });

        const guestCustomers = [
            ...customers.filter(c => c.user_id === null),
            ...mockGuestCustomers
        ];

        return {
            registeredCustomers,
            guestCustomers
        };
    } catch (error) {
        throw error;
    }
};

module.exports.getAppointmentByKey = async (key) => {
    const appointment = await db.Appointments.findOne({
        where: { id: key },
        include: [
            {
                model: db.Customers,
                as: 'customer',
                attributes: ['id', 'name', 'phone', 'membership_tier'],
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['id', 'fullName', 'phoneNumber']
                    }
                ]
            },
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
                        attributes: ['id', 'service_name', 'estimated_duration', 'description']
                    },
                    {
                        model: db.Service_Combo,
                        as: 'combo',
                        attributes: ['id', 'combo_name', 'description'],
                        include: [
                            {
                                model: db.Service_Catalog,
                                as: 'catalogs',
                                attributes: ['id', 'service_name'],
                                through: { attributes: [] }
                            }
                        ]
                    }
                ]
            }
        ]
    });

    if (!appointment) {
        throw { status: 404, message: "Lịch hẹn không tồn tại" };
    }

    return appointment;
};

// Lễ tân đặt lịch hẹn giúp khách hàng cho một thời điểm trong tương lai.
// Chỉ tạo Appointment + Appointment_Details (giữ chỗ + chốt dịch vụ), KHÔNG tạo Service_Order/Task/Quotation
// và không chiếm cầu nâng/gán KTV — vì xe chưa thực sự có mặt tại garage. Service_Order chỉ được tạo
// sau khi khách đến và lễ tân bấm "Tiếp nhận" (receiveAppointment).
module.exports.createAppointmentForCustomer = async (data, receptionistId) => {
    if (!data.scheduled_time) {
        throw { status: 400, message: "Vui lòng chọn thời gian hẹn" };
    }

    const allDetails = [];
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

    // Không chọn dịch vụ/combo cụ thể nào -> đặt lịch dạng "Kiểm tra và Sửa chữa" (khách chưa rõ
    // bệnh, chỉ mô tả tình trạng lỗi). Tự động gán dịch vụ kiểm tra miễn phí (labor_price = 0)
    // giống hệt luồng khách hàng tự đặt, để Appointment luôn có ít nhất 1 Appointment_Details.
    if (allDetails.length === 0) {
        const freeCheckupService = await db.Service_Catalog.findOne({
            where: { labor_price: 0, is_active: true }
        });
        if (freeCheckupService) {
            allDetails.push({ catalog_id: freeCheckupService.id });
        } else {
            throw { status: 400, message: "Vui lòng chọn ít nhất 1 dịch vụ hoặc combo" };
        }
    }

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

    // Kiểm tra lấn giờ (Overlap Validation) — tái dùng đúng logic bên luồng khách hàng tự đặt
    const { calculateAppointmentTime } = require("../../util/calculateAppointmentTime.util");
    const garageConfigService = require("../common/garage_configurations.service");
    const getGarageCapacity = require("../../util/getGarageCapacity.util");

    const capacityData = await getGarageCapacity();
    const capacity = capacityData.maxCapacity;
    if (capacity === 0) {
        throw { status: 400, message: "Garage hiện tại không có khả năng tiếp nhận thêm xe (thiếu nhân sự hoặc khoang sửa chữa)." };
    }

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
            throw { status: 400, message: "Khung giờ này không đủ thời gian trống liền mạch cho các dịch vụ đã chọn. Vui lòng chọn giờ khác!" };
        }
    }

    const transaction = await db.sequelize.transaction();
    try {
        let customer;
        let resolvedVehicleId = data.vehicle_id || null;

        if (resolvedVehicleId) {
            // Khách hàng cũ, xe đã có sẵn trong hệ thống
            const vehicle = await db.Vehicles.findByPk(resolvedVehicleId, { transaction });
            if (!vehicle) {
                throw { status: 400, message: "Xe không tồn tại" };
            }
            customer = await db.Customers.findByPk(vehicle.customer_id, { transaction });
            if (!customer) {
                throw { status: 400, message: "Khách hàng không tồn tại" };
            }
        } else if (data.walk_in) {
            // Khách hàng mới hoặc xe mới — nhập tay giống màn Tạo hóa đơn dịch vụ
            const phoneToUse = data.walk_in.customer_phone;
            if (!phoneToUse) {
                throw { status: 400, message: "Vui lòng nhập số điện thoại khách hàng" };
            }

            [customer] = await db.Customers.findOrCreate({
                where: { phone: phoneToUse },
                defaults: {
                    user_id: null,
                    name: data.walk_in.customer_name || null,
                    membership_tier: "BRONZE",
                    loyalty_points: 0,
                },
                transaction,
            });

            let [make] = await db.Vehicle_Makes.findOrCreate({
                where: { make_name: data.walk_in.brand_name || 'Khác' },
                transaction,
            });

            let [model] = await db.Vehicle_Models.findOrCreate({
                where: {
                    model_name: data.walk_in.model_name || 'Khác',
                    make_id: make.id,
                },
                defaults: { vehicle_type: 'Sedan' },
                transaction,
            });

            let plateToUse = data.walk_in.vehicle_plate;
            if (!plateToUse) {
                throw { status: 400, message: "Vui lòng nhập biển số xe" };
            }
            plateToUse = plateToUse.trim().toUpperCase();

            const yearVal = data.walk_in.vehicle_year
                ? Number(data.walk_in.vehicle_year)
                : new Date().getFullYear();

            let [vehicleRecord] = await db.Vehicles.findOrCreate({
                where: { license_plate: plateToUse },
                defaults: {
                    customer_id: customer.id,
                    model_id: model.id,
                    year: yearVal,
                    color: data.walk_in.vehicle_color || null,
                    avg_daily_mileage: 0,
                },
                transaction,
            });

            resolvedVehicleId = vehicleRecord.id;
        } else {
            throw { status: 400, message: "Vui lòng chọn xe hoặc nhập thông tin khách hàng mới" };
        }

        // Tự động phân loại booking_type giống màn Tạo hóa đơn dịch vụ
        const bookingType = (data.service_ids && data.service_ids.length > 0) || (data.combo_ids && data.combo_ids.length > 0)
            ? 'RECEPTIONIST_SPECIFIC'
            : 'RECEPTIONIST_REPAIR';

        const appointment = await db.Appointments.create({
            customer_id: customer.id,
            vehicle_id: resolvedVehicleId,
            booking_type: bookingType,
            scheduled_time: targetDate,
            notes: data.notes || null,
            status: 'CONFIRMED',
        }, { transaction });

        const detailsToCreate = allDetails.map(d => ({
            appointment_id: appointment.id,
            catalog_id: d.catalog_id || null,
            combo_id: d.combo_id || null,
        }));
        await db.Appointment_Details.bulkCreate(detailsToCreate, { transaction });

        await transaction.commit();
        return appointment;
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

module.exports.receiveAppointment = async (key, status) => {
    const appointment = await db.Appointments.findByPk(key);
    if (!appointment) {
        throw { status: 404, message: "Lịch hẹn không tồn tại" };
    }

    if (appointment.status !== 'PENDING' && appointment.status !== 'CONFIRMED') {
        throw { status: 400, message: "Lịch hẹn này đã được tiếp nhận hoặc đã hủy, không thể tiếp nhận lại." };
    }

    appointment.status = status === 'Technicaian_recieved'
        ? status
        : 'Technicaian_recieved';
    await appointment.save();
    return appointment;
};

module.exports.updateVehicleVin = async (appointmentId, vin_number) => {
    const appointment = await db.Appointments.findByPk(appointmentId, {
        include: [{ model: db.Vehicles, as: 'vehicle' }]
    });

    if (!appointment) {
        throw { status: 404, message: "Lịch hẹn không tồn tại" };
    }

    if (!appointment.vehicle) {
        throw { status: 404, message: "Không tìm thấy xe liên kết với lịch hẹn này" };
    }

    // Check if vin is already used by another vehicle
    if (vin_number) {
        const existingVehicle = await db.Vehicles.findOne({ where: { vin_number } });
        if (existingVehicle && existingVehicle.id !== appointment.vehicle.id) {
            throw { status: 400, message: "Số khung này đã tồn tại trên hệ thống" };
        }
    }

    appointment.vehicle.vin_number = vin_number;
    await appointment.vehicle.save();
    return appointment.vehicle;
};

module.exports.checkVehicleInfo = async (appointmentId) => {
    const appointment = await db.Appointments.findByPk(appointmentId, {
        include: [{ model: db.Vehicles, as: 'vehicle' }]
    });

    if (!appointment) {
        throw { status: 404, message: "Lịch hẹn không tồn tại" };
    }

    if (!appointment.vehicle) {
        throw { status: 404, message: "Không tìm thấy xe liên kết với lịch hẹn này" };
    }

    // Tìm Service Order mới nhất của xe này để lấy số ODO
    const latestServiceOrder = await db.Service_Orders.findOne({
        where: { vehicle_id: appointment.vehicle.id },
        order: [['createdAt', 'DESC']]
    });

    const last_odo = latestServiceOrder ? latestServiceOrder.current_odo : 0;

    return {
        has_vin: !!appointment.vehicle.vin_number,
        vin_number: appointment.vehicle.vin_number || null,
        has_odo: last_odo > 0,
        last_odo: last_odo
    };
};

module.exports.createWalkInTicket = async (data, receptionistId) => {
    const allDetails = [];
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

    if (allDetails.length === 0) {
        const freeCheckupService = await db.Service_Catalog.findOne({
            where: { labor_price: 0, is_active: true }
        });
        if (freeCheckupService) {
            allDetails.push({ catalog_id: freeCheckupService.id });
        } else {
            throw { status: 400, message: "Vui lòng chọn ít nhất 1 dịch vụ hoặc combo" };
        }
    }

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

    const transaction = await db.sequelize.transaction();
    try {
        let customer;
        let resolvedVehicleId = data.vehicle_id || null;

        if (resolvedVehicleId) {
            // Khách hàng cũ, xe đã có sẵn trong hệ thống
            const vehicle = await db.Vehicles.findByPk(resolvedVehicleId, { transaction });
            if (!vehicle) {
                throw { status: 400, message: "Xe không tồn tại" };
            }
            customer = await db.Customers.findByPk(vehicle.customer_id, { transaction });
            if (!customer) {
                throw { status: 400, message: "Khách hàng không tồn tại" };
            }
        } else if (data.walk_in) {
            // Khách hàng mới hoặc xe mới
            const phoneToUse = data.walk_in.customer_phone;
            if (!phoneToUse) {
                throw { status: 400, message: "Vui lòng nhập số điện thoại khách hàng" };
            }

            [customer] = await db.Customers.findOrCreate({
                where: { phone: phoneToUse },
                defaults: {
                    user_id: null,
                    name: data.walk_in.customer_name || null,
                    membership_tier: "BRONZE",
                    loyalty_points: 0,
                },
                transaction,
            });

            let [make] = await db.Vehicle_Makes.findOrCreate({
                where: { make_name: data.walk_in.brand_name || 'Khác' },
                transaction,
            });

            let [model] = await db.Vehicle_Models.findOrCreate({
                where: {
                    model_name: data.walk_in.model_name || 'Khác',
                    make_id: make.id,
                },
                defaults: { vehicle_type: 'Sedan' },
                transaction,
            });

            let plateToUse = data.walk_in.vehicle_plate;
            if (!plateToUse) {
                throw { status: 400, message: "Vui lòng nhập biển số xe" };
            }
            plateToUse = plateToUse.trim().toUpperCase();

            const yearVal = data.walk_in.vehicle_year
                ? Number(data.walk_in.vehicle_year)
                : new Date().getFullYear();

            let [vehicleRecord] = await db.Vehicles.findOrCreate({
                where: { license_plate: plateToUse },
                defaults: {
                    customer_id: customer.id,
                    model_id: model.id,
                    year: yearVal,
                    color: data.walk_in.vehicle_color || null,
                    avg_daily_mileage: 0,
                },
                transaction,
            });

            resolvedVehicleId = vehicleRecord.id;
        } else {
            throw { status: 400, message: "Vui lòng chọn xe hoặc nhập thông tin khách hàng mới" };
        }

        const hasSelectedServices = (data.service_ids && data.service_ids.length > 0) || (data.combo_ids && data.combo_ids.length > 0);
        const bookingType = hasSelectedServices ? 'RECEPTIONIST_SPECIFIC_WALK' : 'RECEPTIONIST_REPAIR_WALK';

        const appointment = await db.Appointments.create({
            customer_id: customer.id,
            vehicle_id: resolvedVehicleId,
            booking_type: bookingType,
            scheduled_time: null,
            notes: data.notes || null,
            status: 'INFORMATION_RECIEVED',
            priority_type: data.priority_type || 'NORMAL',
        }, { transaction });

        const detailsToCreate = allDetails.map(d => ({
            appointment_id: appointment.id,
            catalog_id: d.catalog_id || null,
            combo_id: d.combo_id || null,
        }));
        await db.Appointment_Details.bulkCreate(detailsToCreate, { transaction });

        await transaction.commit();
        return appointment;
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};
