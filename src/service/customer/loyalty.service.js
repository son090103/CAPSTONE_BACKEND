const db = require("../../../models");

// Giá trị mặc định dùng khi chưa seed config trong Garage_Configurations (vd môi trường mới,
// hoặc admin lỡ xóa key) — để addPointsOnPayment không bao giờ throw ra ngoài luồng thanh toán.
const DEFAULT_LOYALTY_CONFIG = {
    LOYALTY_TIER_SILVER_THRESHOLD: 10000000,
    LOYALTY_TIER_GOLD_THRESHOLD: 30000000,
    LOYALTY_TIER_PLATINUM_THRESHOLD: 50000000,
    LOYALTY_MULTIPLIER_BRONZE: 1,
    LOYALTY_MULTIPLIER_SILVER: 1.5,
    LOYALTY_MULTIPLIER_GOLD: 2,
    LOYALTY_MULTIPLIER_PLATINUM: 2.5,
};

// Đọc toàn bộ config hạng thành viên trong 1 query duy nhất (thay vì 5 query riêng lẻ) — admin
// có thể sửa các giá trị này qua trang cấu hình chung (Garage_Configurations).
const getLoyaltyConfig = async () => {
    const keys = Object.keys(DEFAULT_LOYALTY_CONFIG);
    const rows = await db.Garage_Configurations.findAll({
        where: { config_key: keys },
        attributes: ['config_key', 'config_value']
    });
    const config = { ...DEFAULT_LOYALTY_CONFIG };
    rows.forEach(row => {
        const parsed = Number(row.config_value);
        if (Number.isFinite(parsed)) config[row.config_key] = parsed;
    });
    return config;
};

/**
 * Handle adding points when a service order is paid
 * @param {number} serviceOrderId
 * @param {number} paidAmount
 */
const addPointsOnPayment = async (serviceOrderId, paidAmount) => {
    try {
        const serviceOrder = await db.Service_Orders.findByPk(serviceOrderId, {
            include: [
                {
                    model: db.Vehicles,
                    as: 'vehicle',
                    include: [{ model: db.Customers, as: 'customer' }]
                }
            ]
        });

        if (!serviceOrder || !serviceOrder.vehicle || !serviceOrder.vehicle.customer) {
            console.log(`⚠️ Cannot add points for SO-${serviceOrderId}. Customer not found.`);
            return false;
        }

        const customer = serviceOrder.vehicle.customer;
        const loyaltyConfig = await getLoyaltyConfig();

        const oldTotalSpent = parseFloat(customer.total_spent) || 0;
        const newTotalSpent = oldTotalSpent + parseFloat(paidAmount);

        // Hạng chỉ tăng, không bao giờ hạ (dù total_spent chỉ tăng dần nên về lý thuyết không xảy
        // ra, giữ TIER_RANK để so sánh an toàn nếu sau này có logic hoàn tiền/trừ total_spent).
        const TIER_RANK = { BRONZE: 0, SILVER: 1, GOLD: 2, PLATINUM: 3 };
        let computedTier = 'BRONZE';
        if (newTotalSpent >= loyaltyConfig.LOYALTY_TIER_PLATINUM_THRESHOLD) computedTier = 'PLATINUM';
        else if (newTotalSpent >= loyaltyConfig.LOYALTY_TIER_GOLD_THRESHOLD) computedTier = 'GOLD';
        else if (newTotalSpent >= loyaltyConfig.LOYALTY_TIER_SILVER_THRESHOLD) computedTier = 'SILVER';

        const currentRank = TIER_RANK[customer.membership_tier] ?? 0;
        const newTier = TIER_RANK[computedTier] > currentRank ? computedTier : customer.membership_tier;

        const MULTIPLIER_BY_TIER = {
            BRONZE: loyaltyConfig.LOYALTY_MULTIPLIER_BRONZE,
            SILVER: loyaltyConfig.LOYALTY_MULTIPLIER_SILVER,
            GOLD: loyaltyConfig.LOYALTY_MULTIPLIER_GOLD,
            PLATINUM: loyaltyConfig.LOYALTY_MULTIPLIER_PLATINUM,
        };
        // Dùng hạng thành viên hiện tại để tính điểm cho lần thanh toán này
        const multiplier = MULTIPLIER_BY_TIER[newTier] ?? loyaltyConfig.LOYALTY_MULTIPLIER_BRONZE;

        const oldBasePoints = Math.floor(oldTotalSpent / 100000);
        const newBasePoints = Math.floor(newTotalSpent / 100000);
        
        const earnedPoints = Math.floor(newBasePoints * multiplier) - Math.floor(oldBasePoints * multiplier);

        // Update customer total_spent and tier (always, even if earnedPoints is 0)
        await customer.update({
            total_spent: newTotalSpent,
            membership_tier: newTier
        });

        if (earnedPoints > 0) {
            await customer.update({
                loyalty_points: customer.loyalty_points + earnedPoints,
            });

            // Update service order
            await serviceOrder.update({
                points_earned: earnedPoints
            });

            // Create Point Transaction log
            await db.Point_Transactions.create({
                customer_id: customer.id,
                service_order_id: serviceOrder.id,
                action: 'ADD',
                points: earnedPoints,
                description: `Cộng điểm từ thanh toán hóa đơn SO-${serviceOrderId}`
            });

            console.log(`✅ [Loyalty] Added ${earnedPoints} points to customer ${customer.id}`);
        }

        return true;
    } catch (error) {
        console.error("❌ Lỗi trong addPointsOnPayment:", error);
        return false;
    }
};

/**
 * Handle redeeming points when confirming quotation or payment
 * @param {number} customerId 
 * @param {number} pointsToRedeem 
 * @param {number} serviceOrderId 
 */
const redeemPoints = async (customerId, pointsToRedeem, serviceOrderId) => {
    try {
        if (pointsToRedeem <= 0) return false;

        const customer = await db.Customers.findByPk(customerId);
        if (!customer) throw new Error("Customer not found");

        if (customer.loyalty_points < pointsToRedeem) {
            throw new Error("Không đủ điểm");
        }

        // Deduct points ONLY (do not touch total_spent to preserve lifetime tier progress)
        await customer.update({
            loyalty_points: customer.loyalty_points - pointsToRedeem
        });

        // Update service order
        if (serviceOrderId) {
            const serviceOrder = await db.Service_Orders.findByPk(serviceOrderId);
            if (serviceOrder) {
                await serviceOrder.update({
                    points_redeemed: (serviceOrder.points_redeemed || 0) + pointsToRedeem
                });
            }
        }

        // Log transaction
        await db.Point_Transactions.create({
            customer_id: customer.id,
            service_order_id: serviceOrderId || null,
            action: 'DEDUCT',
            points: pointsToRedeem,
            description: serviceOrderId ? `Đổi điểm thanh toán cho SO-${serviceOrderId}` : 'Đổi điểm'
        });

        console.log(`✅ [Loyalty] Deducted ${pointsToRedeem} points from customer ${customer.id}`);
        return true;
    } catch (error) {
        console.error("❌ Lỗi trong redeemPoints:", error);
        throw error;
    }
};

module.exports = {
    addPointsOnPayment,
    redeemPoints
};
