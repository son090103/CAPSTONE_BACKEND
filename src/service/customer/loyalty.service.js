const db = require("../../../models");

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
        
        const oldTotalSpent = parseFloat(customer.total_spent) || 0;
        const newTotalSpent = oldTotalSpent + parseFloat(paidAmount);

        let newTier = customer.membership_tier;
        if (newTotalSpent >= 30000000) {
            newTier = 'GOLD';
        } else if (newTotalSpent >= 10000000) {
            if (newTier !== 'GOLD') newTier = 'SILVER';
        }

        let multiplier = 1;
        // Dùng hạng thành viên hiện tại để tính điểm cho lần thanh toán này
        if (newTier === 'SILVER') multiplier = 1.5;
        if (newTier === 'GOLD') multiplier = 2.0;

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
