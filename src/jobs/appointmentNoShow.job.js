const cron = require('node-cron');
const db = require('../../models');
const { Op } = require('sequelize');
const Appointments = db.Appointments;

const NO_SHOW_GRACE_PERIOD_MS = 60 * 60 * 1000;
const NO_SHOW_NOTE = '[Hệ thống tự hủy] Quá giờ hẹn trên 1 tiếng mà chưa tiếp nhận xe.';

cron.schedule('* * * * *', async () => {
    try {
        const cutoff = new Date(Date.now() - NO_SHOW_GRACE_PERIOD_MS);

        const overdueAppointments = await Appointments.findAll({
            attributes: ['id', 'notes'],
            where: db.sequelize.and(
                { status: 'CONFIRMED', scheduled_time: { [Op.lt]: cutoff } },
                db.sequelize.where(db.sequelize.col('serviceOrder.id'), 'IS', null)
            ),
            include: [
                {
                    model: db.Service_Orders,
                    as: 'serviceOrder',
                    attributes: [],
                    required: false
                }
            ]
        });

        if (!overdueAppointments.length) return;

        await Promise.all(
            overdueAppointments.map((appt) =>
                appt.update({
                    status: 'CANCELLED',
                    notes: appt.notes ? `${appt.notes}\n${NO_SHOW_NOTE}` : NO_SHOW_NOTE
                })
            )
        );

        console.log(`[AppointmentNoShow Job] Đã tự động hủy do quá giờ: ${overdueAppointments.length} lịch hẹn`);
    } catch (error) {
        console.error('[AppointmentNoShow Job] Lỗi:', error.message);
    }
});
