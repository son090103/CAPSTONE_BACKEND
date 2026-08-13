const { success } = require("zod");
const taskAssignmentService = require("../../service/technician/taskAssignment.service");
const { createIssueReportSchema, createAdditionalIssueSchema } = require("../../validation/technician/taskAssignment.validation");

module.exports.getTaskAssignment = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    console.log("chạy vào ass");
    const result = await taskAssignmentService.getTaskAssignment(technicianId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in getTaskAssignment:", error);
    return res.status(error.status || 500).json({
      message:
        error.message || "Đã xảy ra lỗi khi lấy danh sách phân công công việc",
    });
  }
};

module.exports.getServiceOrderDetail = async (req, res) => {
  try {
    const { id } = req.params; // service_order_id
    const technicianId = res.locals.user.id;

    const result = await taskAssignmentService.getServiceOrderDetail(
      id,
      technicianId,
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in getServiceOrderDetail:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Đã xảy ra lỗi khi lấy chi tiết Lệnh sửa chữa",
    });
  }
};

module.exports.startTask = async (req, res) => {
  try {
    const { taskAssignmentId } = req.body;
    const technicianId = res.locals.user.id;

    if (!taskAssignmentId) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng truyền taskAssignmentId vào body.",
      });
    }

    const result = await taskAssignmentService.startTask(
      taskAssignmentId,
      technicianId,
    );

    return res.status(200).json({
      success: true,
      message: "Đã bắt đầu công việc thành công.",
      data: result,
    });
  } catch (error) {
    console.error("Error in startTask:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi bắt đầu công việc.",
    });
  }
};

module.exports.requestPartsExport = async (req, res) => {
  try {
    const { serviceOrderId } = req.body;
    const technicianId = res.locals.user.id;

    if (!serviceOrderId) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng truyền serviceOrderId vào body.",
      });
    }

    const result = await taskAssignmentService.requestPartsExport(
      serviceOrderId,
      technicianId,
    );

    return res.status(200).json({
      success: true,
      message: `Đã gửi yêu cầu xuất kho cho ${result.requestedCount} phụ tùng.`,
      data: result,
    });
  } catch (error) {
    console.error("Error in requestPartsExport:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi gửi yêu cầu xuất kho.",
    });
  }
};

module.exports.completeTask = async (req, res) => {
  try {
    const { taskAssignmentId, content } = req.body;
    const technicianId = res.locals.user.id;
    if (!taskAssignmentId) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng truyền taskAssignmentId vào body."
      });
    }
    const result = await taskAssignmentService.completeTask(
      taskAssignmentId,
      technicianId,
      content,
    );
    return res.status(200).json({
      success: true,
      message: "Đã hoàn thành công việc thành công.",
      data: result,
    });
  } catch (error) {
    console.error("Error in completeTask:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi hoàn thành công việc.",
    });
  }
};

module.exports.startRescueTask = async (req, res) => {
  try {
    const { rescueId, status, technicianLat, technicianLng } = req.body;
    const technicianId = res.locals.user.id;

    if (!rescueId) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng truyền rescueId vào body."
      });
    }

    const result = await taskAssignmentService.startRescueTask(
      rescueId,
      technicianId,
      status,
      technicianLat,
      technicianLng,
    );

    return res.status(200).json({
      success: true,
      message: "Cập nhật trạng thái nhiệm vụ cứu hộ thành công.",
      data: result
    });
  } catch (error) {
    console.error("Error in startRescueTask:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi nhận/bắt đầu nhiệm vụ cứu hộ."
    });
  }
};

module.exports.getMyActiveRescue = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    const result = await taskAssignmentService.getMyActiveRescue(technicianId);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error in getMyActiveRescue:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi lấy nhiệm vụ cứu hộ."
    });
  }
};

module.exports.getMyRescueHistory = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    const result = await taskAssignmentService.getMyRescueHistory(technicianId);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Error in getMyRescueHistory:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi lấy lịch sử cứu hộ."
    });
  }
};

module.exports.getAllComponents = async (req, res) => {
  try {
    const result = await taskAssignmentService.getAllComponents();
    return res.status(200).json({ success: true, data: result })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
};

module.exports.createIssuesReport = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    const { task_id, note, issues } = req.body;
    const validation = createIssueReportSchema.safeParse({ task_id, issues, note, technicianId });
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    };
    const result = await taskAssignmentService.createIssueReports(task_id, issues, note, technicianId);
    return res.status(201).json({
      success: true,
      message: "Tạo báo cáo kiểm tra thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi.",
    });
  }
};

module.exports.getRequestableParts = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    const { serviceOrderId } = req.params;
    const result = await taskAssignmentService.getRequestablePartsForServiceOrder(serviceOrderId, technicianId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi.",
    });
  }
};

module.exports.requestExportParts = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    const { serviceOrderId } = req.params;
    const { detailIds } = req.body;
    if (!Array.isArray(detailIds) || detailIds.length === 0) {
      return res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất 1 phụ tùng cần xuất." });
    }
    const result = await taskAssignmentService.requestExportParts(serviceOrderId, technicianId, detailIds);
    return res.status(200).json({
      success: true,
      message: "Đã gửi yêu cầu xuất kho",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi.",
    });
  }
};

module.exports.reportAdditionalIssue = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    const { task_id, note, issues } = req.body;
    const validation = createAdditionalIssueSchema.safeParse({ task_id, issues, note, technicianId });
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    };
    const result = await taskAssignmentService.reportAdditionalIssue(task_id, issues, note, technicianId);
    return res.status(201).json({
      success: true,
      message: "Ghi nhận lỗi phát sinh thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi.",
    });
  }
};

module.exports.getIssuesReportHistory = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    const result = await taskAssignmentService.getIssuesReportHistory(technicianId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi.",
    });
  }
}

module.exports.getAllDiagnostics = async (req, res) => {
  try {
    const result = await taskAssignmentService.getAllDiagnostics();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.searchDiagnostics = async (req, res) => {
  try {
    const { keyword } = req.query;
    const result = await taskAssignmentService.searchDiagnostics(keyword);
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.filterDiagnostics = async (req, res) => {
  try {
    const { makeId, modelId } = req.query;
    const result = await taskAssignmentService.filterDiagnostics({
      makeId: makeId ? Number(makeId) : null,
      modelId: modelId ? Number(modelId) : null,
    });
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getMakes = async (req, res) => {
  try {
    const result = await taskAssignmentService.getMakes();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getModels = async (req, res) => {
  try {
    const { makeId } = req.query;
    const result = await taskAssignmentService.getModels(
      makeId ? Number(makeId) : null,
    );
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.aiSuggestCauses = async (req, res) => {
  try {
    const { taskAssignmentId, followUpQuestion } = req.body;
    const technicianId = res.locals.user.id;
    if (!taskAssignmentId) {
      return res.status(400).json({
        message: "Vui lòng truyền taskAssignmentId vào body.",
      });
    }
    const result = await taskAssignmentService.aiSuggestCauses(
      taskAssignmentId,
      technicianId,
      followUpQuestion,
    );
    return res.status(200).json({ data: result });
  } catch (error) {
    console.error("AI SUGGEST ERROR:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Lỗi khi gọi AI gợi ý",
    });
  }
};

module.exports.getRepairHistory = async (req, res) => {
  try {
    const result = await taskAssignmentService.getRepairHistory();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.filterRepairHistory = async (req, res) => {
  try {
    const { makeId, modelId } = req.query;
    const result = await taskAssignmentService.filterRepairHistory({
      makeId: makeId ? Number(makeId) : null,
      modelId: modelId ? Number(modelId) : null,
    });
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.searchRepairHistory = async (req, res) => {
  try {
    const { keyword } = req.query;
    const result = await taskAssignmentService.searchRepairHistory(keyword);
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getAllInspectionHistory = async (req, res) => {
  try {
    const result = await taskAssignmentService.getAllInspectionHistory();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.searchInspectionHistory = async (req, res) => {
  try {
    const result = await taskAssignmentService.searchInspectionHistory(
      req.query.keyword,
    );
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.searchRepairHistorySmart = async (req, res) => {
  try {
    const { taskAssignmentId } = req.body;
    const technicianId = res.locals.user.id;
    if (!taskAssignmentId) {
      return res.status(400).json({
        message: "Vui lòng truyền taskAssignmentId vào body.",
      });
    }
    const result = await taskAssignmentService.searchRepairHistorySmart(
      taskAssignmentId,
      technicianId,
    );
    return res.status(200).json({ data: result });
  } catch (error) {
    console.error("SMART SEARCH ERROR:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.filterInspectionHistory = async (req, res) => {
  try {
    const { makeId, modelId } = req.query;
    const result = await taskAssignmentService.filterInspectionHistory({
      makeId: makeId ? Number(makeId) : null,
      modelId: modelId ? Number(modelId) : null,
    });
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getMyCompletedTasks = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    const result = await taskAssignmentService.getCompletedTasks(technicianId);
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.addRepairNote = async (req, res) => {
  try {
    const { taskId, content } = req.body;
    const technicianId = res.locals.user.id;
    if (!taskId) {
      return res.status(400).json({ message: "Vui lòng truyền taskId vào body." });
    }
    const result = await taskAssignmentService.addRepairNote(taskId, technicianId, content);
    return res.status(201).json({ message: "Đã lưu kinh nghiệm sửa chữa.", data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getMyRepairNotes = async (req, res) => {
  try {
    const technicianId = res.locals.user.id;
    const result = await taskAssignmentService.getMyRepairNotes(technicianId);
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.pauseTask = async (req, res) => {
  try {
    const { taskAssignmentId, reason, status } = req.body;
    const technicianId = res.locals.user.id;
    if (!taskAssignmentId) {
      return res.status(400).json({ message: "Vui lòng truyền taskAssignmentId vào body." });
    }
    const result = await taskAssignmentService.pauseTask(taskAssignmentId, technicianId, reason, status);
    return res.status(200).json({ message: "Đã tạm dừng công việc.", data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};

module.exports.resumeTask = async (req, res) => {
  try {
    const { taskAssignmentId } = req.body;
    const technicianId = res.locals.user.id;
    if (!taskAssignmentId) {
      return res.status(400).json({ message: "Vui lòng truyền taskAssignmentId vào body." });
    }
    const result = await taskAssignmentService.resumeTask(taskAssignmentId, technicianId);
    return res.status(200).json({ message: "Đã tiếp tục công việc.", data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};
