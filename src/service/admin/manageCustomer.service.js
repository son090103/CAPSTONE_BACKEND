const { Customers, User, Role, Vehicles, Appointments, Service_Orders, Appointment_Details, Service_Catalog, Service_Combo, Vehicle_Models, Vehicle_Makes, Rescue_Requests } = require("../../../models");
const { Op } = require("sequelize");
const bcrypt = require("bcrypt");

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
                },
                {
                    model: Rescue_Requests,
                    as: 'rescueRequests',
                    required: false,
                    separate: true,
                    limit: 1,
                    order: [['createdAt', 'DESC']],
                    include: [{
                        model: User,
                        as: 'technician',
                        attributes: ['id', 'fullName', 'latitude', 'longitude'],
                        required: false
                    }]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

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

const { normalizeVnPhone } = require("../../util/phone.util");

module.exports.createCustomer = async (data) => {
    try {
        const { fullName, phoneNumber, email, membership_tier, loyalty_points, status, type, password, avatar } = data;
        
        // Validate and normalize phone number
        const normalizedPhone = normalizeVnPhone(phoneNumber);
        if (!normalizedPhone) {
            throw new Error("Số điện thoại không hợp lệ");
        }

        // Check if phone number already exists in Customers
        const existingCustomer = await Customers.findOne({ where: { phone: normalizedPhone } });
        if (existingCustomer) {
            throw new Error("Số điện thoại khách hàng đã tồn tại");
        }

        if (type === "REGISTERED") {
            // Check if phone number already exists in User
            const existingUser = await User.findOne({ where: { phoneNumber: normalizedPhone } });
            if (existingUser) {
                throw new Error("Số điện thoại tài khoản người dùng đã tồn tại");
            }

            // Get customer role
            const role = await Role.findOne({ where: { roleCode: "CUSTOMER" } });
            if (!role) {
                throw new Error("Không tìm thấy vai trò CUSTOMER");
            }

            // Hash password
            const passwordToHash = password || "123456";
            const hashedPassword = await bcrypt.hash(passwordToHash, 10);

            // Create user
            const user = await User.create({
                fullName: fullName.trim(),
                phoneNumber: normalizedPhone,
                email: email ? email.trim() : null,
                password: hashedPassword,
                roleId: role.id,
                status: status || "ACTIVE",
                avatar: avatar || null,
            });

            // Create customer
            const customer = await Customers.create({
                user_id: user.id,
                name: fullName.trim(),
                phone: normalizedPhone,
                email: email ? email.trim() : null,
                membership_tier: membership_tier || "BRONZE",
                loyalty_points: loyalty_points || 0,
                total_spent: 0,
            });

            return {
                success: true,
                message: "Tạo khách hàng hệ thống thành công",
                data: customer
            };
        } else {
            // Create guest customer
            const customer = await Customers.create({
                user_id: null,
                name: fullName.trim(),
                phone: normalizedPhone,
                email: email ? email.trim() : null,
                membership_tier: membership_tier || "NONE",
                loyalty_points: 0,
                total_spent: 0,
            });

            return {
                success: true,
                message: "Tạo khách hàng vãng lai thành công",
                data: customer
            };
        }
    } catch (error) {
        throw new Error(error.message);
    }
};

module.exports.updateCustomer = async (id, data) => {
    try {
        const customer = await Customers.findByPk(id);
        if (!customer) {
            throw new Error("Khách hàng không tồn tại");
        }

        const { fullName, phoneNumber, membership_tier, loyalty_points, status, avatar } = data;

        const customerUpdates = {};
        if (fullName) customerUpdates.name = fullName.trim();
        if (phoneNumber) {
            const normalizedPhone = normalizeVnPhone(phoneNumber);
            if (!normalizedPhone) {
                throw new Error("Số điện thoại không hợp lệ");
            }
            customerUpdates.phone = normalizedPhone;
        }
        if (membership_tier) customerUpdates.membership_tier = membership_tier;
        if (loyalty_points !== undefined) customerUpdates.loyalty_points = Number(loyalty_points);

        await customer.update(customerUpdates);

        if (customer.user_id) {
            const user = await User.findByPk(customer.user_id);
            if (user) {
                const userUpdates = {};
                if (fullName) userUpdates.fullName = fullName.trim();
                if (phoneNumber) {
                    const normalizedPhone = normalizeVnPhone(phoneNumber);
                    userUpdates.phoneNumber = normalizedPhone;
                }
                if (status) userUpdates.status = status;
                if (avatar !== undefined) userUpdates.avatar = avatar;

                await user.update(userUpdates);
            }
        }

        return {
            success: true,
            message: "Cập nhật khách hàng thành công",
            data: customer
        };
    } catch (error) {
        throw new Error(error.message);
    }
};
