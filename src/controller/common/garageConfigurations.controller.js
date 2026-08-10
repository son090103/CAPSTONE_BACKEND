const configService = require("../../service/common/garage_configurations.service");
const { getConfigurationByKeySchema, updateConfigurationSchema } = require("../../validation/common/garage_configuration.validation");

module.exports.getConfigurations = async (req, res) => {
    try {
        const result = await configService.getConfigurations();
        return res.status(200).json({
            success: true,
            message: "Lấy danh sách cấu hình thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.getAvailability = async (req, res) => {
    try {
        const date = req.query.date;
        const result = await configService.getAvailability(date);
        return res.status(200).json({
            success: true,
            message: "Lấy thông tin ca làm việc và sức chứa thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.getConfigurationByKey = async (req, res) => {
    try {
        const validation = getConfigurationByKeySchema.safeParse(req.params);
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                message: validation.error.issues[0].message
            });
        }

        const result = await configService.getConfigurationByKey(validation.data.key);
        return res.status(200).json({
            success: true,
            message: "Lấy thông tin cấu hình thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.updateConfiguration = async (req, res) => {
    try {
        const paramsValidation = getConfigurationByKeySchema.safeParse(req.params);
        if (!paramsValidation.success) {
            return res.status(400).json({
                success: false,
                message: paramsValidation.error.issues[0].message
            });
        }
        const bodyValidation = updateConfigurationSchema.safeParse(req.body);
        if (!bodyValidation.success) {
            return res.status(400).json({
                success: false,
                message: bodyValidation.error.issues[0].message
            });
        }

        const result = await configService.updateConfiguration(paramsValidation.data.key, bodyValidation.data.config_value);
        return res.status(200).json({
            success: true,
            message: "Cập nhật cấu hình thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};


