const db = require('../../../models');
const { workflows } = require('./customerUiKnowledge');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const doc = (id, type, sourceId, text, metadata = {}) => ({
  id: `${type}-${id}`,
  text: clean(text),
  metadata: { type, source_id: String(sourceId), ...metadata }
});

async function serviceDocuments() {
  const rows = await db.Service_Catalog.findAll({
    where: { is_active: true },
    include: [
      { model: db.Service_Categories, as: 'category', attributes: ['id', 'category_name'], required: false },
      { model: db.Spare_Parts, as: 'sparePart', attributes: ['id', 'name'], required: false }
    ]
  });
  return rows.map(row => doc(row.id, 'service', row.id,
    `Dịch vụ: ${row.service_name}. Nhóm: ${row.category?.category_name || 'chưa phân nhóm'}. ` +
    `Mô tả: ${row.description || 'chưa có mô tả'}. Thời gian dự kiến: ${row.estimated_duration} phút. ` +
    `Chu kỳ khuyến nghị: ${row.recommended_interval_days ? `${row.recommended_interval_days} ngày` : 'không cố định'}. ` +
    `Phụ tùng thường gắn với dịch vụ: ${row.sparePart?.name || 'không có phụ tùng cố định'}. ` +
    `Giá và tình trạng phục vụ phải tra cứu trực tiếp từ cơ sở dữ liệu tại thời điểm trả lời.`,
    { category_id: row.category_id, requires_bay: Boolean(row.requires_bay) }
  ));
}

async function comboDocuments() {
  const rows = await db.Service_Combo.findAll({
    where: { is_active: true },
    include: [{ model: db.Service_Catalog, as: 'catalogs', attributes: ['id', 'service_name', 'estimated_duration'], through: { attributes: [] } }]
  });
  return rows.map(row => {
    const services = row.catalogs || [];
    const duration = services.reduce((sum, item) => sum + Number(item.estimated_duration || 0), 0);
    return doc(row.id, 'service_combo', row.id,
      `Gói dịch vụ: ${row.combo_name}. Mô tả: ${row.description || 'chưa có mô tả'}. ` +
      `Bao gồm: ${services.map(item => item.service_name).join(', ') || 'chưa cấu hình dịch vụ'}. ` +
      `Tổng thời gian dự kiến: ${duration || 'chưa xác định'} phút. Mức giảm cấu hình: ${row.discount_percentage}%. ` +
      `Giá cuối cùng phải tra cứu trực tiếp từ cơ sở dữ liệu.`,
      { service_ids: services.map(item => String(item.id)) }
    );
  });
}

async function diagnosticDocuments() {
  if (!db.Diagnostic_Knowledge) return [];
  const rows = await db.Diagnostic_Knowledge.findAll({
    include: [
      { model: db.Vehicle_Makes, as: 'make', attributes: ['make_name'], required: false },
      { model: db.Vehicle_Models, as: 'model', attributes: ['model_name'], required: false }
    ]
  });
  return rows.filter(row => clean(row.symptom).length >= 8 && clean(row.possible_causes).length >= 8).map(row => doc(
    row.id, 'diagnostic', row.id,
    `Triệu chứng: ${row.symptom}. Nguyên nhân có thể: ${row.possible_causes}. ` +
    `Áp dụng: ${row.make?.make_name || 'mọi hãng'} ${row.model?.model_name || ''}. ` +
    `Đây là đánh giá sơ bộ; phải kiểm tra xe thực tế trước khi kết luận. Nếu có dấu hiệu mất an toàn, ưu tiên dừng xe và gọi cứu hộ.`,
    { ...(row.make_id ? { make_id: row.make_id } : {}), ...(row.model_id ? { model_id: row.model_id } : {}) }
  ));
}

async function componentDocuments() {
  if (!db.Vehicle_Components) return [];
  const rows = await db.Vehicle_Components.findAll({
    where: { is_active: true },
    include: [{ model: db.Vehicle_Components, as: 'parent', attributes: ['id', 'name'], required: false }]
  });
  return rows.map(row => doc(row.id, 'vehicle_component', row.id,
    `Bộ phận xe: ${row.name}. Thuộc hệ thống/nhóm cha: ${row.parent?.name || 'bộ phận cấp cao nhất'}. ` +
    `Dùng tên bộ phận này để liên hệ triệu chứng, lỗi kỹ thuật, dịch vụ kiểm tra và phụ tùng tương ứng.`,
    { ...(row.parent_id ? { parent_id: row.parent_id } : {}) }
  ));
}

async function sparePartDocuments() {
  if (!db.Spare_Parts) return [];
  const rows = await db.Spare_Parts.findAll({
    include: [
      { model: db.Part_Categories, as: 'category', attributes: ['id', 'category_name', 'description'], required: false },
      { model: db.Service_Catalog, as: 'services', attributes: ['id', 'service_name'], required: false }
    ]
  });
  return rows.map(row => doc(row.id, 'spare_part', row.id,
    `Phụ tùng: ${row.name}. Mã SKU: ${row.sku}. Thương hiệu: ${row.brand || 'không xác định'}. ` +
    `Nhóm: ${row.category?.category_name || 'chưa phân nhóm'} - ${row.category?.description || ''}. ` +
    `Dịch vụ liên quan: ${(row.services || []).map(item => item.service_name).join(', ') || 'chưa gắn dịch vụ'}. ` +
    `Bảo hành tham khảo theo cấu hình: ${row.warranty_period_months || 0} tháng, ${row.warranty_km_limit || 0} km. ` +
    `Giá bán và tồn kho phải tra cứu trực tiếp từ cơ sở dữ liệu.`,
    { category_id: row.category_id, brand: clean(row.brand || 'unknown') }
  ));
}

async function warrantyDocuments() {
  if (!db.Warranty_Policies) return [];
  const rows = await db.Warranty_Policies.findAll({ where: { is_active: true } });
  return rows.filter(row => clean(row.description)).map(row => doc(row.id, 'warranty_policy', row.id,
    `Chính sách bảo hành ${row.policy_name}. Mã chính sách: ${row.policy_code}. Nội dung: ${row.description}. ` +
    `${row.pdf_document_url ? `Tài liệu tham khảo: ${row.pdf_document_url}.` : ''}`,
    { policy_code: row.policy_code }
  ));
}

function workflowDocuments() {
  return workflows.map(flow => doc(flow.id, 'ui_workflow', flow.id,
    `Quy trình giao diện: ${flow.title}. Đường dẫn: ${flow.route}. ${flow.content}`,
    { route: flow.route }
  ));
}

function operationalProcessDocuments() {
  return [doc('vehicle-inspection', 'operational_process', 'vehicle-inspection',
    `Quy trình kiểm tra xe tại gara: 1. Lễ tân tiếp nhận xe, xác nhận thông tin xe, số kilomet và triệu chứng khách mô tả. ` +
    `2. Gara tạo lệnh sửa chữa và công việc kiểm tra; kỹ thuật viên kiểm tra tổng quát hoặc theo triệu chứng. ` +
    `3. Kỹ thuật viên ghi nhận bộ phận và lỗi phát hiện. ` +
    `4. Gara lập báo giá gồm dịch vụ, công sửa chữa và phụ tùng cần thiết rồi gửi khách hàng. ` +
    `5. Chỉ sau khi khách duyệt báo giá, gara mới thực hiện các hạng mục sửa chữa tương ứng. ` +
    `6. Kỹ thuật viên cập nhật tiến độ, hoàn thành công việc và kiểm tra lại. ` +
    `7. Gara xử lý thanh toán và bàn giao xe. Nếu khách chỉ yêu cầu kiểm tra, không tự thêm giá hay hướng dẫn đặt lịch trừ khi khách hỏi.`
  )];
}

// Chỉ nhận case đã hoàn thành, có liên kết đầy đủ. Không đưa customer, phone, plate, VIN,
// email, tọa độ hay payment vào document.
async function repairCaseDocuments() {
  if (!db.Vehicle_Issues || !db.Task || !db.Service_Orders) return [];
  const issues = await db.Vehicle_Issues.findAll({
    include: [{
      model: db.Task, as: 'task', required: true, attributes: ['id', 'service_catalog_id'],
      include: [
        { model: db.Service_Catalog, as: 'catalog', attributes: ['id', 'service_name'], required: false },
        {
          model: db.Service_Orders, as: 'serviceOrder', required: true,
          where: { status: 'COMPLETED' }, attributes: ['id', 'symptoms', 'current_odo', 'actual_finish_time'],
          include: [{
            model: db.Vehicles, as: 'vehicle', attributes: ['year'], required: false,
            include: [{
              model: db.Vehicle_Models, as: 'model', attributes: ['id', 'model_name'], required: false,
              include: [{ model: db.Vehicle_Makes, as: 'make', attributes: ['id', 'make_name'], required: false }]
            }]
          }]
        },
        { model: db.Repair_Notes, as: 'repairNotes', attributes: ['content'], required: false }
      ]
    }],
    includeIgnoreAttributes: false
  });
  return issues.filter(issue => clean(issue.task?.serviceOrder?.symptoms).length >= 10).map(issue => {
    const order = issue.task.serviceOrder;
    const vehicle = order.vehicle;
    const model = vehicle?.model;
    const notes = (issue.task.repairNotes || []).map(item => clean(item.content)).filter(Boolean).join(' ');
    return doc(issue.id, 'repair_case', issue.id,
      `Ca sửa chữa ẩn danh đã hoàn thành. Xe: ${model?.make?.make_name || 'không rõ hãng'} ${model?.model_name || 'không rõ model'}, năm ${vehicle?.year || 'không rõ'}. ` +
      `Số km tại thời điểm tiếp nhận: ${order.current_odo ?? 'không có'}. Triệu chứng: ${order.symptoms}. ` +
      `Lỗi phát hiện: ${issue.error_description}. Ghi chú lỗi: ${issue.note || 'không có'}. ` +
      `Dịch vụ xử lý: ${issue.task.catalog?.service_name || 'chưa gắn dịch vụ'}. ` +
      `Ghi chú sửa chữa đã ghi nhận: ${notes || 'không có'}. Kết quả: lệnh sửa chữa đã hoàn thành.`,
      { ...(model?.make?.id ? { make_id: model.make.id } : {}), ...(model?.id ? { model_id: model.id } : {}) }
    );
  });
}

const builders = {
  service: serviceDocuments,
  service_combo: comboDocuments,
  diagnostic: diagnosticDocuments,
  vehicle_component: componentDocuments,
  spare_part: sparePartDocuments,
  warranty_policy: warrantyDocuments,
  ui_workflow: async () => workflowDocuments(),
  operational_process: async () => operationalProcessDocuments(),
  repair_case: repairCaseDocuments
};

async function buildRagDocuments(selectedTypes = Object.keys(builders)) {
  const unknown = selectedTypes.filter(type => !builders[type]);
  if (unknown.length) throw new Error(`Loại RAG không hợp lệ: ${unknown.join(', ')}`);
  const groups = await Promise.all(selectedTypes.map(async type => ({ type, documents: await builders[type]() })));
  return { groups, documents: groups.flatMap(group => group.documents) };
}

module.exports = { buildRagDocuments, RAG_TYPES: Object.keys(builders) };
