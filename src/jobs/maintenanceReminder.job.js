const cron = require('node-cron');
const db = require('../../models');
const { Op } = require('sequelize');
const { notifyUser } = require('../util/notification.util');

// Nhắc bảo dưỡng định kỳ.
// Chỉ dựa trên thời gian kể từ lần làm dịch vụ đó gần nhất (recommended_interval_days trên Service_Catalog) —
// không dùng km ước tính vì hệ thống không có cách nào biết km thật của xe khi xe không ở xưởng.
async function runMaintenanceReminderCheck() {
    const periodicCatalogs = await db.Service_Catalog.findAll({
        where: { recommended_interval_days: { [Op.ne]: null } },
    });
    if (periodicCatalogs.length === 0) return { remindedVehicleCount: 0 };

    const vehicles = await db.Vehicles.findAll({
        include: [{ model: db.Customers, as: 'customer', where: { user_id: { [Op.ne]: null } }, required: true }],
    });

    const now = new Date();
    let remindedVehicleCount = 0;

    for (const vehicle of vehicles) {
        const dueServiceNames = [];

        for (const catalog of periodicCatalogs) {
            const lastDone = await db.Quotation_Details.findOne({
                where: {
                    service_id: catalog.id,
                    status: { [Op.ne]: 'CANCELLED' },
                },
                include: [
                    {
                        model: db.Quotations,
                        as: 'quotation',
                        required: true,
                        where: { status: 'APPROVED' },
                        include: [
                            {
                                model: db.Task,
                                as: 'task',
                                required: true,
                                include: [
                                    {
                                        model: db.Service_Orders,
                                        as: 'serviceOrder',
                                        required: true,
                                        where: { vehicle_id: vehicle.id, status: 'COMPLETED' },
                                    },
                                ],
                            },
                        ],
                    },
                ],
                order: [[{ model: db.Quotations, as: 'quotation' }, { model: db.Task, as: 'task' }, { model: db.Service_Orders, as: 'serviceOrder' }, 'exit_time', 'DESC']],
            });
            if (!lastDone) continue;

            const lastServiceOrder = lastDone.quotation.task.serviceOrder;
            if (!lastServiceOrder.exit_time) continue;

            const daysSinceLastDone = (now - new Date(lastServiceOrder.exit_time)) / (1000 * 60 * 60 * 24);
            if (daysSinceLastDone < catalog.recommended_interval_days) continue;

            const alreadyReminded = await db.Notification.findOne({
                where: {
                    recipientId: vehicle.customer.user_id,
                    notificationType: 'MAINTENANCE_REMINDER',
                    referenceId: vehicle.id,
                    createdAt: { [Op.gte]: lastServiceOrder.exit_time },
                    content: { [Op.iLike]: `%${catalog.service_name}%` },
                },
            });
            if (alreadyReminded) continue;

            dueServiceNames.push(catalog.service_name);
        }

        if (dueServiceNames.length === 0) continue;

        await notifyUser(vehicle.customer.user_id, {
            title: 'Nhắc bảo dưỡng định kỳ',
            content: `Xe ${vehicle.license_plate} của bạn đã đến hạn bảo dưỡng: ${dueServiceNames.join(', ')}. Hãy đặt lịch để được kiểm tra kịp thời.`,
            notificationType: 'MAINTENANCE_REMINDER',
            referenceId: vehicle.id,
            priority: 'NORMAL',
        });
        remindedVehicleCount++;
    }

    console.log(`[MaintenanceReminder Job] Đã nhắc bảo dưỡng cho ${remindedVehicleCount} xe lúc ${now}`);
    return { remindedVehicleCount };
}

cron.schedule('0 8 * * *', async () => {
    try {
        await runMaintenanceReminderCheck();
    } catch (error) {
        console.error('[MaintenanceReminder Job] Lỗi:', error.message);
    }
});

module.exports = { runMaintenanceReminderCheck };
