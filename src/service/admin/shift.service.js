const db = require("../../../models");
const { Op } = require("sequelize");
const { getWorkingDaysList } = require('../../util/dateShiftSlot.util');
module.exports.getAllShiftSlots = async () => {
    return await db.Shift_Slots.findAll({
        order: [['start_time', 'ASC']]
    });
};


module.exports.createShiftSlot = async (data) => {
    return await db.Shift_Slots.create(data);
};

module.exports.updateShiftSlot = async (id, data) => {
    const slot = await db.Shift_Slots.findByPk(id);
    if (!slot) throw new Error("Không tìm thấy ca làm việc");
    return await slot.update(data);
};

module.exports.getShiftTemplates = async (startDate, endDate) => {
    return await db.Shift_Templates.findAll({
        where: {
            work_date: {
                [Op.between]: [startDate, endDate]
            }
        },
        include: [
            {
                model: db.User,
                as: 'user',
                attributes: ['id', 'fullName', 'phoneNumber']
            },
            {
                model: db.Shift_Slots,
                as: 'shiftSlot'
            }
        ]
    });
};

module.exports.assignShift = async (userId, slotIds, workDate) => {
    // Xóa lịch cũ
    await db.Shift_Templates.destroy({
        where: { user_id: userId, work_date: workDate }
    });

    // Nếu slotIds có data, tạo lịch mới
    if (slotIds && Array.isArray(slotIds) && slotIds.length > 0) {
        const templates = slotIds.map(slotId => ({
            user_id: userId,
            slot_id: slotId,
            work_date: workDate,
            is_auto: false,
            is_confirmed: true
        }));
        return await db.Shift_Templates.bulkCreate(templates);
    }
    return { message: "Đã cập nhật ca làm việc" };
};


module.exports.autoGenerateSchedule = async (startDate, endDate) => {
    const transaction = await db.sequelize.transaction();
    try {
        // 1. Lấy tất cả ca làm việc đang hoạt động
        const activeSlots = await db.Shift_Slots.findAll({
            where: { is_active: true },
            order: [['start_time', 'ASC']]
        });
        if (!activeSlots.length) throw new Error("Không có ca nào đang hoạt động.");

        // 2. Lấy danh sách technician đang Active
        const activeStaff = await db.User.findAll({
            where: { status: 'ACTIVE' },
            include: [{ model: db.Role, as: 'role' }]
        });
        const validStaff = activeStaff.filter(s =>
            ['TECHNICIAN', 'TECHNICIAN_LEADER'].includes(s.role?.roleCode)
        ).map(s => {
            // Tự động map Tổ trưởng (TECHNICIAN_LEADER) thành Senior (Level 3)
            // Trong trường hợp DB đang set default skillLevel là 1
            if (s.role?.roleCode === 'TECHNICIAN_LEADER') {
                s.skillLevel = 3;
            }
            return s;
        });
        if (!validStaff.length) throw new Error("Không có technician nào.");

        // 3. Xóa lịch cũ trong transaction — rollback nếu lỗi
        // phải xóa vì khi admin bấm thì nó phải xóa đi để update lại lịch vào db 
        // nếu kh sẽ sinh ra 2 file giống nhau 
        await db.Shift_Templates.destroy({
            where: { work_date: { [Op.between]: [startDate, endDate] } },
            transaction
        });

        // 4. Tạo danh sách ngày thông qua hàm dùng chung

        const days = getWorkingDaysList(startDate, endDate);

        // 5. Theo dõi số ngày làm việc để cân bằng
        const workCounts = {};
        validStaff.forEach(s => workCounts[s.id] = 0);

        const dailySlotCounts = {}; // { 'dateStr_userId': số ca }

        const generatedTemplates = [];

        // 6. Thuật toán xếp ca
        for (const dateStr of days) {
            for (const slot of activeSlots) {
                let assignedCount = 0;

                const maxNeeded = slot.max_technicians || 3;
                const minSenior = slot.min_senior || 0;
                const minMid = slot.min_mid || 0;
                const preferSenior = slot.prefer_senior || 1;
                const preferMid = slot.prefer_mid || 1;
                const preferJunior = slot.prefer_junior || 1;

                // Chỉ lọc điều kiện tối đa 2 ca/ngày. KHÔNG lọc workCounts < 6 ở đây
                // vì Hard Rule (Bắt buộc) phải được ưu tiên lấp đầy trước, dù người đó đã làm > 6 ca
                let available = [...validStaff]
                    .filter(s => {
                        const key = `${dateStr}_${s.id}`;
                        return (dailySlotCounts[key] || 0) < 2;
                    })
                    .sort(() => Math.random() - 0.5)
                    .sort((a, b) => workCounts[a.id] - workCounts[b.id]); // sort ưu tiên người làm ít ca hơn

                // Hàm assign theo điều kiện
                const assign = (condFn, count, isHardRule = false) => {
                    if (count <= 0) return;
                    let done = 0; // đếm riêng cho lần gọi này

                    available = available.filter(s => {
                        if (done >= count || assignedCount >= maxNeeded) return true;
                        if (!condFn(s)) return true;

                        if (!isHardRule && workCounts[s.id] >= 6) return true;

                        const key = `${dateStr}_${s.id}`;
                        generatedTemplates.push({
                            user_id: s.id,
                            slot_id: slot.id,
                            work_date: dateStr,
                            is_auto: true,
                            is_confirmed: false
                        });
                        workCounts[s.id]++;
                        assignedCount++;
                        done++; // chỉ đếm trong lần gọi assign này
                        dailySlotCounts[key] = (dailySlotCounts[key] || 0) + 1; // cộng dồn ca/ngày
                        return false;
                    });
                };

                // Bước 1 — Hard rules: bắt buộc có đủ Senior và Mid (Bỏ qua giới hạn 6 ca/tuần)
                assign(s => s.skillLevel === 3, minSenior, true);
                assign(s => s.skillLevel === 2, minMid, true);

                // Bước 2 — Soft rules: ưu tiên theo prefer_* (Tuân thủ giới hạn 6 ca/tuần)
                assign(s => s.skillLevel === 3, preferSenior - minSenior, false);
                assign(s => s.skillLevel === 2, preferMid - minMid, false);
                assign(s => s.skillLevel === 1, preferJunior, false);

                // Bước 3 — Lấp nốt slot trống nếu vẫn chưa đủ max (Tuân thủ giới hạn 6 ca/tuần)
                assign(s => true, maxNeeded - assignedCount, false);
            }
        }

        await db.Shift_Templates.bulkCreate(generatedTemplates, { transaction });
        await transaction.commit();

        return { message: "Auto-generate thành công", totalGenerated: generatedTemplates.length };

    } catch (err) {
        await transaction.rollback();
        throw err;
    }
};

module.exports.confirmSchedule = async (startDate, endDate) => {
    return await db.Shift_Templates.update(
        { is_confirmed: true },
        {
            where: {
                work_date: {
                    [Op.between]: [startDate, endDate]
                }
            }
        }
    );
};
