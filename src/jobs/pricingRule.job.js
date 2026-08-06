const cron = require('node-cron');
const db = require('../../models');
const Pricing_Rule = db.Pricing_Rules;
const { Op } = require('sequelize');
// job này để cấu hình theo ngày tự động mà mình đã set up giảm giá các kiểu trên web 
cron.schedule('0 * * * *', async () => {
    try {
        const now = new Date();

        // Tắt các rule đã hết hạn
        const [deactivated] = await Pricing_Rule.update(
            { is_active: false },
            {
                where: {
                    is_active: true,
                    is_deleted: false,
                    end_date: { [Op.lt]: now }
                }
            }
        );

        // Bật các rule đến ngày bắt đầu
        const [activated] = await Pricing_Rule.update(
            { is_active: true },
            {
                where: {
                    is_active: false,
                    is_deleted: false,
                    start_date: { [Op.lte]: now },
                    [Op.or]: [
                        { end_date: null },
                        { end_date: { [Op.gt]: now } }
                    ]
                }
            }
        );

        console.log(`[PricingRule Job] Đã tắt: ${deactivated} | Đã bật: ${activated} lúc ${now}`);
    } catch (error) {
        console.error('[PricingRule Job] Lỗi:', error.message);
    }
});