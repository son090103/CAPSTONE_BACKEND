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
                attributes: ['id', 'current_odo']
            }
        ],
        order: [['scheduled_time', 'DESC']]
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
                    required: false,
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
        const guestCustomers = customers.filter(c => c.user_id === null);

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

module.exports.receiveAppointment = async (key) => {
    console.log("chạy vào tiếp nhận xe")
    const appointment = await db.Appointments.findByPk(key);
    if (!appointment) {
        throw { status: 404, message: "Lịch hẹn không tồn tại" };
    }

    if (appointment.status !== 'PENDING' && appointment.status !== 'CONFIRMED') {
        throw { status: 400, message: "Lịch hẹn này đã được tiếp nhận hoặc đã hủy, không thể tiếp nhận lại." };
    }

    appointment.status = 'IN_PROGRESS';
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

