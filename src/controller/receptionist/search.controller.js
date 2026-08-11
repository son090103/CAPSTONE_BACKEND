const searchService = require("../../service/receptionist/search.service")
module.exports.getCustomerInfoByPhone = async (req, res) => {
    console.log("chạy vào tìm user")
    try {
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { phone, partial = false } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, message: "Vui lòng cung cấp số điện thoại" });
        }

        const result = partial
            ? await searchService.getCustomerInfoByPhone(phone, true)
            : await searchService.getCustomerInfoByPhone(phone);
        return res.status(200).json({
            success: true,
            message: "Lấy thông tin khách hàng thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};
