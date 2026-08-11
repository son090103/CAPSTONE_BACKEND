const db = require("../../../models");

module.exports.getReceivedAppointments = async () => {
    const appointments = await db.Appointments.findAll({
        where: {
            status: {
                [db.Sequelize.Op.in]: ['INFORMATION_RECEIVED', 'IN_PROGRESS', 'COMPLETED']
            }
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
                attributes: ['id', 'current_odo', 'bay_id', 'bay_status', 'status']
            }
        ],
        order: [
            [db.Sequelize.literal(`CASE WHEN "Appointments"."priority_type" = 'EMERGENCY' THEN 0 ELSE 1 END`), 'ASC'],
            [db.Sequelize.literal(`COALESCE("Appointments"."scheduled_time", "Appointments"."created_at")`), 'ASC'],
            ['id', 'ASC']
        ]
    });

    return appointments;
};
