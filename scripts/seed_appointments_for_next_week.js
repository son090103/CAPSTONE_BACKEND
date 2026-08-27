const db = require('../models');

async function seed() {
  try {
    console.log('--- BẮT ĐẦU SEED LỊCH HẸN TUẦN TỚI (ĐA DẠNG DỮ LIỆU) ---');

    // 1. Tìm hoặc tạo khách hàng demo
    const customerUser = await db.User.findOne({
      include: [{ model: db.Role, as: 'role', where: { roleCode: 'CUSTOMER' } }]
    }) || await db.User.findOne();

    if (!customerUser) {
      console.error('Không tìm thấy User nào trong database!');
      return;
    }
    console.log(`Tìm thấy Khách hàng: ${customerUser.fullName} (ID: ${customerUser.id})`);

    // Lấy hoặc tạo chiếc xe demo
    let vehicle = await db.Vehicles.findOne({ where: { customer_id: customerUser.id } }) 
      || await db.Vehicles.findOne();

    if (!vehicle) {
      vehicle = await db.Vehicles.create({
        customer_id: customerUser.id,
        license_plate: '30H-333.33',
        brand: 'VinFast',
        model: 'VF 8',
        color: 'Xanh',
        year: 2024,
        odo: 8500
      });
    }

    // 2. Lấy toàn bộ phụ tùng
    const parts = await db.Spare_Parts.findAll();
    if (parts.length === 0) {
      console.error('Không tìm thấy phụ tùng nào trong database!');
      return;
    }

    // 3. Lấy 6 dịch vụ đầu tiên để gán phụ tùng
    const catalogs = await db.Service_Catalog.findAll({ limit: 6 });
    if (catalogs.length < 6) {
      console.error('Database cần ít nhất 6 dịch vụ trong Service_Catalogs!');
      return;
    }

    for (let i = 0; i < parts.length && i < catalogs.length; i++) {
      catalogs[i].spare_part_id = parts[i].id;
      await catalogs[i].save();
      console.log(`Liên kết: Dịch vụ "${catalogs[i].service_name}" -> Phụ tùng "${parts[i].name}" (ID: ${parts[i].id})`);
    }

    // 4. Xóa lịch hẹn cũ đã tạo trong tuần tới để tránh trùng lặp
    const { Op } = db.Sequelize;
    const startAppDate = new Date();
    const endAppDate = new Date();
    endAppDate.setDate(startAppDate.getDate() + 7);

    await db.Appointments.destroy({
      where: {
        scheduled_time: { [Op.between]: [startAppDate, endAppDate] }
      }
    });
    console.log('Đã dọn dẹp lịch hẹn cũ trong tuần tới.');

    // 5. Tạo 6 lịch hẹn phân bố đều trong tuần tới (từ ngày mai + 1 đến ngày mai + 6)
    const notes = [
      'Bảo dưỡng hệ thống bôi trơn động cơ',
      'Kiểm tra và thay má phanh định kỳ',
      'Động cơ giật chớp nhẹ, cần kiểm tra bugi',
      'Thay thế cốc lọc dầu hộp số định kỳ',
      'Hệ thống phanh kêu kẹt kẹt khi phanh',
      'Bảo dưỡng tổng thể và thay bugi định kỳ'
    ];

    for (let i = 0; i < 6 && i < catalogs.length; i++) {
      const appDate = new Date();
      appDate.setDate(appDate.getDate() + (i % 6) + 1);
      appDate.setHours(9 + (i % 3) * 2, 30, 0, 0);

      const app = await db.Appointments.create({
        customer_id: customerUser.id,
        vehicle_id: vehicle.id,
        booking_type: i % 2 === 0 ? 'MAINTENANCE' : 'REPAIR',
        scheduled_time: appDate,
        notes: notes[i],
        status: 'CONFIRMED'
      });

      await db.Appointment_Details.create({
        appointment_id: app.id,
        catalog_id: catalogs[i].id
      });

      console.log(`Đã tạo Lịch hẹn ID ${app.id} ngày ${appDate.toLocaleDateString('vi-VN')} với dịch vụ "${catalogs[i].service_name}"`);
    }

    console.log('--- SEED LỊCH HẸN TUẦN TỚI THÀNH CÔNG (ĐA DẠNG DỮ LIỆU) ---');
    process.exit(0);
  } catch (error) {
    console.error('Lỗi khi seed lịch hẹn:', error);
    process.exit(1);
  }
}

seed();
