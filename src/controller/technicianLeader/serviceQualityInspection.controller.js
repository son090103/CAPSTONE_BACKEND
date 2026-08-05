const serviceQualityInspectionService = require("../../service/technicianLeader/serviceQualityInspection.service");
const {rejectFinalInspectionSchema} = require("../../validation/technicianLeader/serviceQualityInspection.validation")

module.exports.getServiceOrdersPendingQC = async (req, res) => {
  try {
    const result = await serviceQualityInspectionService.getServiceOrdersPendingFinalQC();
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.approveFinalInspection = async (req, res) => {
  try {
    const { serviceOrderId } = req.params;
    const headId = res.locals.user.id;
    const result = await serviceQualityInspectionService.approveFinalInspection(
      Number(serviceOrderId),
      headId,
    );
    return res.status(200).json({
      message: "Nghiệm thu tổng thể thành công, xe sẵn sàng giao",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.rejectFinalInspection = async (req, res) => {
  try {
    const { serviceOrderId } = req.params;
    const headId = res.locals.user.id;
    const validation = rejectFinalInspectionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    }
    const { taskIds, reason } = validation.data;
    const result = await serviceQualityInspectionService.rejectFinalInspection(
      Number(serviceOrderId),
      taskIds,
      reason,
      headId,
    );
    return res.status(200).json({ message: "Đã trả về làm lại", data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};
