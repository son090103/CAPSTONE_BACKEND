const db = require("../../../models");
const { Op } = require("sequelize");

module.exports.getCustomerInfoByPhone = async (phone) => {
    // 1. Tìm Customer by phone
    const customer = await db.Customers.findOne({
        where: { phone: phone },
        include: [
            {
                model: db.User,
                as: 'user',
                attributes: ['fullName', 'phoneNumber']
            },
            {
                model: db.Vehicles,
                as: 'vehicles',
                attributes: ['id', 'license_plate', 'vin_number', 'year'],
                include: [
                    {
                        model: db.Vehicle_Models,
                        as: 'model',
                        attributes: ['id', 'model_name'],
                        include: [
                            {
                                model: db.Vehicle_Makes,
                                as: 'make',
                                attributes: ['id', 'make_name']
                            }
                        ]
                    },
                    {
                        model: db.Service_Orders,
                        as: 'serviceOrders',
                        where: {
                            status: {
                                [Op.notIn]: ['COMPLETED', 'CANCELLED', 'PAID']
                            }
                        },
                        required: false
                    }
                ]
            }
        ]
    });

    // 2. Tìm Appointments theo SĐT
    const appointments = await db.Appointments.findAll({
        include: [
            {
                model: db.Customers,
                as: 'customer',
                where: { phone: phone },
                attributes: ['id', 'name', 'phone'],
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['fullName', 'phoneNumber']
                    }
                ]
            },
            {
                model: db.Vehicles,
                as: 'vehicle',
                include: [
                    {
                        model: db.Vehicle_Models,
                        as: 'model',
                        include: [{ model: db.Vehicle_Makes, as: 'make' }]
                    }
                ]
            },
            {
                model: db.Service_Orders,
                as: 'serviceOrder',
                required: false
            }
        ],
        where: {
            status: {
                [Op.in]: ['PENDING', 'CONFIRMED', 'ARRIVED']
            },
            '$serviceOrder.id$': null
        },
        order: [['scheduled_time', 'DESC']]
    });

    if (!customer && appointments.length === 0) {
        return null; // Không tìm thấy
    }

    const formattedCustomer = customer ? {
        id: customer.id,
        customer_name: customer.user?.fullName || customer.name || '',
        phone: customer.phone,
        vehicles: customer.vehicles ? customer.vehicles.map(v => ({
            id: v.id,
            license_plate: v.license_plate,
            vin_number: v.vin_number,
            year: v.year,
            brand: v.model?.make?.make_name || '',
            model: v.model?.model_name || '',
            isInGarage: v.serviceOrders && v.serviceOrders.length > 0
        })) : []
    } : null;

    const formattedAppointments = appointments.map(apt => {
        let appointmentDate = '';
        let appointmentTime = '';
        if (apt.scheduled_time) {
            const dateObj = new Date(apt.scheduled_time);
            appointmentDate = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
            appointmentTime = String(dateObj.getHours()).padStart(2, '0') + ':' + String(dateObj.getMinutes()).padStart(2, '0');
        }

        return {
            id: apt.id,
            status: apt.status,
            appointmentDate,
            appointmentTime,
            customer_name: apt.customer?.user?.fullName || apt.customer?.name || '',
            phone: apt.customer?.phone || '',
            vehicle: apt.vehicle ? {
                id: apt.vehicle.id,
                license_plate: apt.vehicle.license_plate,
                vin_number: apt.vehicle.vin_number,
                year: apt.vehicle.year,
                brand: apt.vehicle.model?.make?.make_name || '',
                model: apt.vehicle.model?.model_name || ''
            } : null
        };
    });

    return {
        customer: formattedCustomer,
        appointments: formattedAppointments
    };
};