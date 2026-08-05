const db = require("../../models");
const { Op } = require("sequelize");

// tìm kiếm những customer có trong giờ đặt của khách hàng 

module.exports.findAvailableTechnicians = async (scheduledTime, transaction) => {
    const targetDate = new Date(scheduledTime);

    // 1. Format work_date (YYYY-MM-DD) theo local time
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    // 2. Format target time (HH:MM:SS) theo local time
    const hh = String(targetDate.getHours()).padStart(2, '0');
    const mm = String(targetDate.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}:00`;

    const techRole = await db.Role.findOne({ where: { roleCode: 'TECHNICIAN' }, transaction });
    if (!techRole) return [];

    // Tìm các slot hợp lệ (start_time <= timeStr <= end_time)
    const matchingSlots = await db.Shift_Slots.findAll({
        where: {
            is_active: true,
            start_time: { [Op.lte]: timeStr },
            end_time: { [Op.gte]: timeStr }
        },
        transaction
    });

    const slotIds = matchingSlots.map(s => s.id);
    let scheduledUserIds = [];

    // Hàm tiện ích để tìm userId theo date và slots
    const findTechsByDateAndSlots = async (queryDateStr) => {
        const whereCond = {
            work_date: queryDateStr
        };

        // Nếu có slot khớp với giờ hẹn, ta lấy người được phân slot đó
        if (slotIds.length > 0) {
            whereCond.slot_id = { [Op.in]: slotIds };
        }

        const templates = await db.Shift_Templates.findAll({
            where: whereCond,
            attributes: ['user_id'],
            transaction
        });
        return templates.map(t => t.user_id);
    };

    // 3. Tìm người làm việc trong ngày hiện tại và khớp slot
    scheduledUserIds = await findTechsByDateAndSlots(dateStr);

    // 4. Nếu không có ai trong ngày/slot đó, fallback lùi lại 7 ngày
    if (scheduledUserIds.length === 0) {
        // Check xem NGUYÊN CẢ NGÀY đó có ai được xếp lịch không (bất kể slot nào)
        // Nếu nguyên ngày không có lịch -> có nghĩa là tuần đó chưa được xếp lịch -> lùi 7 ngày hợp lý.
        const totalTemplatesToday = await db.Shift_Templates.count({
            where: { work_date: dateStr },
            transaction
        });

        if (totalTemplatesToday === 0) {
            const lastWeekDate = new Date(targetDate);
            lastWeekDate.setDate(lastWeekDate.getDate() - 7);

            const ly = lastWeekDate.getFullYear();
            const lm = String(lastWeekDate.getMonth() + 1).padStart(2, '0');
            const ld = String(lastWeekDate.getDate()).padStart(2, '0');
            const lastWeekDateStr = `${ly}-${lm}-${ld}`;

            scheduledUserIds = await findTechsByDateAndSlots(lastWeekDateStr);
        }
    }

    // 5. Nếu có người thoả mãn, tìm User model của họ
    if (scheduledUserIds.length > 0) {
        const uniqueUserIds = [...new Set(scheduledUserIds)];
        const availableTechs = await db.User.findAll({
            where: {
                id: { [Op.in]: uniqueUserIds },
                roleId: techRole.id,
                status: 'ACTIVE'
            },
            transaction
        });

        if (availableTechs.length > 0) {
            return availableTechs;
        }
    }

    // 6. Nếu không tìm được ai (hoặc quản lý chưa từng xếp lịch), fallback cuối cùng: 
    // Trả về toàn bộ technician để đảm bảo hệ thống không bị lỗi crash không có thợ.
    const allTechs = await db.User.findAll({
        where: { roleId: techRole.id, status: 'ACTIVE' },
        transaction
    });

    return allTechs;
};
