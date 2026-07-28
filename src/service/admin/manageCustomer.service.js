const { Customers, User, Vehicles, Appointments, Service_Orders, Appointment_Details, Service_Catalog, Service_Combo, Vehicle_Models, Vehicle_Makes } = require("../../../models");
const { Op } = require("sequelize");

module.exports.getCustomers = async (searchParams = "") => {
    try {
        let whereCondition = {};
        if (searchParams) {
            whereCondition = {
                [Op.or]: [
                    { name: { [Op.like]: `%${searchParams}%` } },
                    { phone: { [Op.like]: `%${searchParams}%` } }
                ]
            };
        }

        const customers = await Customers.findAll({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'fullName', 'phoneNumber', 'avatar', 'status', 'latitude', 'longitude'],
                    required: false
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Phân loại khách hàng: đã đăng ký hệ thống (có user_id) và vãng lai (không có user_id)
        const registeredCustomers = customers.filter(c => c.user_id !== null);
        const guestCustomers = customers.filter(c => c.user_id === null);

        return {
            success: true,
            data: {
                registeredCustomers,
                guestCustomers
            }
        };
    } catch (error) {
        throw new Error(error.message);
    }
};

module.exports.getCustomerById = async (id) => {
    try {
        const customer = await Customers.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'fullName', 'phoneNumber', 'avatar', 'status'],
                    required: false
                },
                {
                    model: Vehicles,
                    as: 'vehicles',
                    required: false,
                    include: [
                        {
                            model: Vehicle_Models,
                            as: 'model',
                            required: false,
                            include: [
                                {
                                    model: Vehicle_Makes,
                                    as: 'make',
                                    required: false
                                }
                            ]
                        }
                    ]
                },
                {
                    model: Appointments,
                    as: 'appointments',
                    required: false,
                    include: [
                        {
                            model: Service_Orders,
                            as: 'serviceOrder',
                            required: false
                        },
                        {
                            model: Vehicles,
                            as: 'vehicle',
                            required: false
                        },
                        {
                            model: Appointment_Details,
                            as: 'appointmentDetails',
                            required: false,
                            include: [
                                {
                                    model: Service_Catalog,
                                    as: 'catalog',
                                    required: false
                                },
                                {
                                    model: Service_Combo,
                                    as: 'combo',
                                    required: false,
                                    include: [
                                        {
                                            model: Service_Catalog,
                                            as: 'catalogs',
                                            required: false
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ],
            order: [
                [{ model: Appointments, as: 'appointments' }, 'scheduled_time', 'DESC']
            ]
        });

        if (!customer) {
            throw new Error("Không tìm thấy khách hàng");
        }

        return {
            success: true,
            data: customer
        };
    } catch (error) {
        throw new Error(error.message);
    }
};
