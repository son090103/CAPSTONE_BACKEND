const db = require("../../../models");
const { Op } = require("sequelize");
const getGarageCapacity = require("../../util/getGarageCapacity.util");

module.exports.getConfigurations = async () => {
    return await db.Garage_Configurations.findAll({
        attributes: ['id', 'config_key', 'config_value', 'description', 'createdAt', 'updatedAt'],
        order: [['config_key', 'ASC']]
    });
};

module.exports.getAvailability = async (dateStr) => {
    const shifts = await db.Shift_Slots.findAll({
        where: { is_active: true },
        attributes: ['id', ['slot_name', 'shift_name'], 'start_time', 'end_time', 'is_active', 'createdAt', 'updatedAt'],
        order: [['start_time', 'ASC']]
    });

    const capacityData = await getGarageCapacity();
    const capacity = capacityData.maxCapacity;

    let bookedCounts = {};
    if (dateStr) {
        const startOfDay = new Date(`${dateStr}T00:00:00Z`);
        const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

        // Helper tính toán các giờ bị trùng chỉ trong 1 ngày cụ thể (dateStr)
        const getOccupiedHours = (startTime, endTime) => {
            if (endTime <= startOfDay || startTime >= endOfDay) return [];

            const effectiveStart = startTime < startOfDay ? startOfDay : startTime;
            const effectiveEnd = endTime > endOfDay ? endOfDay : endTime;

            const startHour = effectiveStart.getUTCHours();
            let endHour = effectiveEnd.getUTCHours();

            if (effectiveEnd.getMinutes() === 0 && effectiveEnd.getSeconds() === 0 && endHour > startHour) {
                endHour -= 1;
            }

            const hours = [];
            for (let h = startHour; h <= endHour; h++) {
                hours.push(h);
            }
            return hours;
        };

        // 1. Check tương lai (Appointments)
        const appointments = await db.Appointments.findAll({
            where: {
                scheduled_time: {
                    [Op.between]: [startOfDay, endOfDay]
                },
                status: {
                    [Op.in]: ['PENDING', 'CONFIRMED']
                }
            },
            attributes: ['id', 'scheduled_time'],
            include: [
                {
                    model: db.Appointment_Details,
                    as: 'appointmentDetails',
                    attributes: ['catalog_id', 'combo_id']
                }
            ]
        });

        const { calculateAppointmentTime } = require("../../util/calculateAppointmentTime.util");

        await Promise.all(appointments.map(async (app) => {
            const { endTime } = await calculateAppointmentTime(app.appointmentDetails, app.scheduled_time);
            const occupiedHours = getOccupiedHours(app.scheduled_time, endTime);
            occupiedHours.forEach(h => {
                bookedCounts[h] = (bookedCounts[h] || 0) + 1;
            });
        }));

        // 2. Check hiện tại (Service_Orders đang sửa chữa)
        const activeOrders = await db.Service_Orders.findAll({
            where: {
                status: {
                    [Op.in]: ['INSPECTING', 'IN_PROGRESS', 'WAITING_FOR_PARTS']
                },
                estimated_finish_time: {
                    [Op.ne]: null,
                    [Op.gt]: startOfDay
                },
                entry_time: {
                    [Op.lt]: endOfDay
                }
            },
            attributes: ['entry_time', 'estimated_finish_time']
        });

        activeOrders.forEach(order => {
            const occupiedHours = getOccupiedHours(order.entry_time, order.estimated_finish_time);
            occupiedHours.forEach(h => {
                bookedCounts[h] = (bookedCounts[h] || 0) + 1;
            });
        });
    }

    return {
        shifts,
        capacity,
        bookedCounts
    };
};

module.exports.getConfigurationByKey = async (key) => {
    const config = await db.Garage_Configurations.findOne({
        where: { config_key: key },
        attributes: ['id', 'config_key', 'config_value', 'description', 'createdAt', 'updatedAt']
    });

    if (!config) {
        throw { status: 404, message: `Không tìm thấy cấu hình với key: ${key}` };
    }

    return config;
};

module.exports.updateConfiguration = async (key, value) => {
    const config = await db.Garage_Configurations.findOne({ where: { config_key: key } });

    if (!config) {
        throw { status: 404, message: `Không tìm thấy cấu hình với key: ${key}` };
    }

    await config.update({ config_value: value });
    return config;
};
