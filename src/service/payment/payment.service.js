const db = require("../../../models");
const { notifyUser, notifyRole } = require("../../util/notification.util");
const loyaltyService = require("../customer/loyalty.service");

const notifyDepositPaid = async (quotationId) => {
    try {
        const quotation = await db.Quotations.findByPk(quotationId, {
            include: [
                {
                    model: db.Task,
                    as: "task",
                    attributes: ["id", "service_order_id"],
                    include: [
                        {
                            model: db.Service_Orders,
                            as: "serviceOrder",
                            attributes: ["id"],
                            include: [
                                {
                                    model: db.Vehicles,
                                    as: "vehicle",
                                    attributes: ["id"],
                                    include: [
                                        { model: db.Customers, as: "customer", attributes: ["id", "user_id"] },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        });
        const customerUserId = quotation?.task?.serviceOrder?.vehicle?.customer?.user_id;
        if (customerUserId) {
            await notifyUser(customerUserId, {
                title: "Đã nhận tiền cọc",
                content: `Xưởng đã nhận được tiền cọc cho báo giá #${quotationId}.`,
                notificationType: "SERVICE_ORDER",
                referenceId: quotationId,
            }, "new_notification", { type: "DEPOSIT_PAID", quotationId });
        }
        await notifyRole("RECEPTIONIST", {
            title: "Khách hàng đã cọc tiền",
            content: `Khách hàng đã thanh toán tiền cọc cho báo giá #${quotationId}.`,
            notificationType: "SERVICE_ORDER",
            referenceId: quotationId,
        }, "new_notification", { type: "DEPOSIT_PAID", quotationId });
    } catch (error) {
        console.error(`Lỗi khi gửi thông báo đã cọc cho báo giá ${quotationId}:`, error);
    }
};


const handleSepayTransaction = async (paymentData) => {
    try {
        const {
            transferType,
            transferAmount,
            content,
            gateway,
            transactionDate,
            accountNumber,
            subAccount,


            code,
            accumulated,
            referenceCode
        } = paymentData;

        // Chỉ xử lý các giao dịch cộng tiền (tiền vào tài khoản)
        if (transferType !== 'in') {
            return { success: true, message: "Không phải giao dịch cộng tiền, bỏ qua." };
        }

        console.log(`💰 [Sepay] Nhận được ${transferAmount} VND. Nội dung: "${content}"`);

        // 1. Phân tích nội dung chuyển khoản (content) để tìm Mã Báo Giá Cọc (BG-xxx)
        let bookingCode = null;
        let bookingPayment = null;
        let isDeposit = false;

        const bgMatch = content?.match(/BG[- ]?(\d+)/i);
        if (bgMatch) {
            const quotationId = parseInt(bgMatch[1], 10);
            console.log(`✅ [Sepay Deposit] Tìm thấy mã Báo giá cọc: #${quotationId}`);
            const quotation = await db.Quotations.findByPk(quotationId, {
                include: [{ model: db.Task, as: "task" }]
            });

            if (quotation) {
                isDeposit = true;
                console.log(`💰 [Sepay Deposit] Yêu cầu cọc: ${quotation.deposit_amount} VND | Thực chuyển: ${transferAmount} VND`);

                // Kiểm tra số tiền chuyển đến có khớp/lớn hơn hoặc bằng số tiền cọc hay không
                if (Number(transferAmount) >= Number(quotation.deposit_amount)) {
                    const serviceOrderId = quotation.task ? quotation.task.service_order_id : null;

                    if (serviceOrderId) {
                        bookingPayment = await db.Booking_Payments.findOne({
                            where: { order_id: serviceOrderId }
                        });

                        if (!bookingPayment) {
                            bookingPayment = await db.Booking_Payments.create({
                                order_id: serviceOrderId,
                                amount: transferAmount,
                                payment_status: 'DEPOSITED',
                                payment_method: 'VIETQR',
                                payment_gateway: gateway || 'BANK',
                                transaction_code: code,
                                paid_at: transactionDate ? new Date(transactionDate) : new Date()
                            });
                        } else {
                            await bookingPayment.update({
                                payment_status: 'DEPOSITED',
                                amount: transferAmount,
                                transaction_code: code,
                                paid_at: transactionDate ? new Date(transactionDate) : new Date()
                            });
                        }
                    }

                    // Cập nhật deposit_paid_at trong bảng Quotations
                    await quotation.update({
                        deposit_paid_at: transactionDate ? new Date(transactionDate) : new Date()
                    });

                    // Cập nhật status các phụ tùng đặt riêng (Custom_Part_Orders) thành WAITING_ARRIVAL —
                    // đã tách khỏi Quotation_Details.status (giờ chỉ còn dùng cho hàng kho thường).
                    const { Op } = require("sequelize");
                    const quotationDetailIds = (
                        await db.Quotation_Details.findAll({
                            where: { quotation_id: quotationId },
                            attributes: ["id"],
                        })
                    ).map((d) => d.id);
                    await db.Custom_Part_Orders.update(
                        { status: "WAITING_ARRIVAL" },
                        {
                            where: {
                                quotation_detail_id: quotationDetailIds,
                                status: "WAITING_DEPOSIT",
                            },
                        }
                    );

                    console.log(`🎉 [Sepay Deposit] Cập nhật cọc deposit_paid_at và Custom_Part_Orders (WAITING_ARRIVAL) thành công cho Báo giá #${quotationId}`);
                    await notifyDepositPaid(quotationId);
                } else {
                    console.warn(`⚠️ [Sepay Deposit] Số tiền chuyển (${transferAmount} VND) nhỏ hơn số tiền cọc (${quotation.deposit_amount} VND)`);
                }
            }
        }

        // Đơn lịch hẹn / Sửa chữa chung (AGM-xxx / SO-xxx) có thể kèm điểm (PT-xxx)
        const match = content?.match(/(?:AGM|SO)[- ]?(\d+)(?:[- ]?PT[- ]?(\d+))?/i);

        if (!bgMatch && match) {
            bookingCode = match[1];
            const pointsRedeemed = match[2] ? parseInt(match[2], 10) : 0;
            console.log(`✅ [Sepay] Tìm thấy mã đơn/lịch hẹn: ${bookingCode} | Điểm dùng: ${pointsRedeemed}`);

            bookingPayment = await db.Booking_Payments.findOne({
                where: {
                    order_id: parseInt(bookingCode, 10),
                    payment_status: { [db.Sequelize.Op.in]: ['PENDING', 'DEPOSITED'] }
                }
            });

            const serviceOrder = await db.Service_Orders.findByPk(parseInt(bookingCode, 10), {
                include: [{
                    model: db.Vehicles,
                    as: 'vehicle',
                    include: [{ model: db.Customers, as: 'customer' }]
                }]
            });

            if (serviceOrder && pointsRedeemed > 0) {
                // Deduct loyalty points if specified in QR addInfo
                const customerId = serviceOrder.vehicle?.customer?.id;
                if (customerId) {
                    try {
                        const loyaltyService = require('../customer/loyalty.service');
                        await loyaltyService.redeemPoints(customerId, pointsRedeemed, serviceOrder.id);
                        console.log(`✅ [Sepay] Đã tự động trừ ${pointsRedeemed} điểm từ khách hàng ${customerId}`);
                    } catch (e) {
                        console.error(`❌ [Sepay] Lỗi khi trừ điểm:`, e);
                    }
                }
            }

            // Nếu chưa có bản ghi Booking_Payments cho đơn này, tự động khởi tạo nếu Service_Order tồn tại
            if (!bookingPayment) {
                if (serviceOrder) {
                    console.log(`✅ [Sepay] Tìm thấy ServiceOrder #${bookingCode}. Tự động khởi tạo Booking_Payments.`);
                    bookingPayment = await db.Booking_Payments.create({
                        order_id: serviceOrder.id,
                        amount: transferAmount,
                        payment_status: 'PENDING',
                        payment_method: 'VIETQR',
                        payment_gateway: gateway || 'BANK'
                    });
                }
            }
        }


        // --- TỰ ĐỘNG NHẬN DIỆN QUA SỐ TIỀN (FALLBACK) ---
        if (!bookingPayment && !bgMatch) {
            console.log(`⚠️ [Sepay] Nội dung không chứa mã hoặc mã không đúng. Kích hoạt Fallback tìm theo số tiền: ${transferAmount} VND`);
            const { Op } = require("sequelize");

            // Fallback 1: Kiểm tra Báo giá đang chờ cọc khớp đúng số tiền deposit_amount
            const pendingQuotation = await db.Quotations.findOne({
                where: {
                    deposit_amount: transferAmount,
                    deposit_paid_at: null
                },
                order: [['updatedAt', 'DESC']]
            });

            if (pendingQuotation) {
                isDeposit = true;
                console.log(`✅ [Sepay Fallback] Khớp số tiền cọc ${transferAmount} VND với Báo giá #${pendingQuotation.id}`);
                await pendingQuotation.update({
                    deposit_paid_at: transactionDate ? new Date(transactionDate) : new Date()
                });

                const fallbackDetailIds = (
                    await db.Quotation_Details.findAll({
                        where: { quotation_id: pendingQuotation.id },
                        attributes: ["id"],
                    })
                ).map((d) => d.id);
                await db.Custom_Part_Orders.update(
                    { status: "WAITING_ARRIVAL" },
                    {
                        where: {
                            quotation_detail_id: fallbackDetailIds,
                            status: "WAITING_DEPOSIT",
                        },
                    }
                );

                // Cập nhật/Tạo bản ghi trong Booking_Payments tương ứng với Service_Order của Báo giá này
                const task = await db.Task.findByPk(pendingQuotation.task_id);
                const serviceOrderId = task ? task.service_order_id : null;
                if (serviceOrderId) {
                    bookingPayment = await db.Booking_Payments.findOne({
                        where: { order_id: serviceOrderId }
                    });
                    if (!bookingPayment) {
                        bookingPayment = await db.Booking_Payments.create({
                            order_id: serviceOrderId,
                            amount: transferAmount,
                            payment_status: 'DEPOSITED',
                            payment_method: 'VIETQR',
                            payment_gateway: gateway || 'BANK',
                            transaction_code: code,
                            paid_at: transactionDate ? new Date(transactionDate) : new Date()
                        });
                    } else {
                        await bookingPayment.update({
                            payment_status: 'DEPOSITED',
                            amount: transferAmount,
                            transaction_code: code,
                            paid_at: transactionDate ? new Date(transactionDate) : new Date()
                        });
                    }
                    console.log(`✅ [Sepay Fallback] Đã lưu bản ghi Booking_Payments cho ServiceOrder #${serviceOrderId}`);
                }
                await notifyDepositPaid(pendingQuotation.id);
            } else {
                // Fallback 2: Kiểm tra đơn Booking_Payments
                bookingPayment = await db.Booking_Payments.findOne({
                    where: {
                        payment_status: 'PENDING',
                        amount: transferAmount,
                        created_at: {
                            [Op.gte]: new Date(Date.now() - 15 * 60 * 1000) // Trong vòng 15 phút
                        }
                    },
                    order: [['created_at', 'DESC']]
                });

                if (!bookingPayment) {
                    const depositedPayments = await db.Booking_Payments.findAll({
                        where: {
                            payment_status: 'DEPOSITED',
                            created_at: {
                                [Op.gte]: new Date(Date.now() - 120 * 60 * 1000) // Trong vòng 2 tiếng
                            }
                        },
                        order: [['updated_at', 'DESC']]
                    });

                    for (const payment of depositedPayments) {
                        const serviceOrderId = payment.order_id;
                        const serviceOrder = await db.Service_Orders.findByPk(serviceOrderId);
                        if (serviceOrder) {
                            const tasks = await db.Task.findAll({
                                where: { service_order_id: serviceOrderId },
                                attributes: ['id']
                            });
                            const taskIds = tasks.map(t => t.id);
                            const quotation = await db.Quotations.findOne({
                                where: { task_id: taskIds },
                                include: [{ model: db.Quotation_Details, as: 'items' }]
                            });
                            if (quotation && Array.isArray(quotation.items)) {
                                const total = quotation.items.reduce((sum, item) => {
                                    return sum + (parseFloat(item.amount) || 0);
                                }, 0);
                                const deposit = parseFloat(payment.amount) || 0;
                                const remaining = Math.max(0, total - deposit);
                                if (Math.abs(remaining - transferAmount) < 2) {
                                    bookingPayment = payment;
                                    console.log(`✅ [Sepay Fallback 2.1] Khớp thành công số tiền còn lại (${remaining} VND) với ServiceOrder #${serviceOrderId}`);
                                    break;
                                }
                            }
                        }
                    }
                }

                if (bookingPayment) {
                    console.log(`✅ [Sepay Fallback] Đã tự động map với đơn hàng ID: ${bookingPayment.order_id} do khớp số tiền.`);
                } else {
                    console.log(`❌ [Sepay] Không tìm thấy đơn hàng/báo giá nào đang chờ thanh toán khớp với số tiền ${transferAmount} VND. Cần kiểm tra thủ công.`);
                }
            }
        }

        // Check if it was already paid to prevent duplicate point additions
        const wasAlreadyPaid = bookingPayment && bookingPayment.payment_status === 'PAID';

        // Cập nhật trạng thái nếu tìm thấy
        if (bookingPayment) {
            const updateFields = {
                transaction_code: code,
                paid_at: transactionDate ? new Date(transactionDate) : new Date(),
            };
            if (!isDeposit) {
                updateFields.payment_status = 'PAID';
            }
            await bookingPayment.update(updateFields);
            console.log(`✅ [Sepay] Đã cập nhật Booking_Payments (ID: ${bookingPayment.id}) ${isDeposit ? 'cho đặt cọc (DEPOSITED)' : 'thành PAID'}`);
        }

        // 3. Luôn luôn lưu giao dịch vào Payment_Transactions để backup/đối soát
        const transaction = await db.Payment_Transactions.create({
            payment_id: bookingPayment ? bookingPayment.id : null,
            gateway: gateway || 'BANK',
            transaction_date: transactionDate ? new Date(transactionDate) : new Date(),
            account_number: accountNumber,
            sub_account: subAccount,
            amount_in: transferAmount,
            amount_out: 0,
            accumulated: accumulated,
            code: code,
            transaction_content: content,
            reference_number: referenceCode,
            raw_body: JSON.stringify(paymentData)
        });

        console.log(`✅ [Sepay] Đã lưu giao dịch vào Payment_Transactions (ID: ${transaction.id})`);

        // 4. Add Loyalty Points if it's a full payment AND it wasn't already paid
        if (bookingPayment && !isDeposit && !wasAlreadyPaid) {
            await loyaltyService.addPointsOnPayment(bookingPayment.order_id, transferAmount);
        }

        return { success: true };
    } catch (error) {
        console.error("❌ Lỗi trong service xử lý Sepay:", error);
        throw error;
    }
};

const checkPaymentStatus = async (bookingCode) => {
    try {
        // 1. Kiểm tra nếu là Báo giá cọc (BG-xxx hoặc BGxxx)
        if (typeof bookingCode === 'string' && bookingCode.toUpperCase().startsWith('BG')) {
            const quotationId = parseInt(bookingCode.replace(/\D/g, ''), 10);
            if (!isNaN(quotationId)) {
                const quotation = await db.Quotations.findByPk(quotationId);
                if (quotation && quotation.deposit_paid_at) {
                    return { isPaid: true };
                }
            }
            return { isPaid: false };
        }

        // 2. Đơn thường (Booking / Service_Orders)
        const numericOrderId = parseInt(String(bookingCode).replace(/\D/g, ''), 10);
        if (!isNaN(numericOrderId)) {
            const bookingPayment = await db.Booking_Payments.findOne({
                where: { order_id: numericOrderId }
            });

            if (bookingPayment && bookingPayment.payment_status === 'PAID') {
                return { isPaid: true };
            }
        }
        return { isPaid: false };
    } catch (error) {
        console.error("❌ Lỗi trong service checkPaymentStatus:", error);
        throw error;
    }
};

const initPayment = async (orderId, amount, paymentMethod = 'VIETQR') => {
    try {
        const [payment, created] = await db.Booking_Payments.findOrCreate({
            where: { order_id: orderId },
            defaults: {
                order_id: orderId,
                amount: amount,
                payment_status: 'PENDING',
                payment_method: paymentMethod,
                payment_gateway: 'BANK'
            }
        });
        if (!created && payment.payment_status !== 'PAID' && payment.payment_status !== 'DEPOSITED') {
            await payment.update({ amount: amount, payment_status: 'PENDING' });
        }
        return payment;
    } catch (error) {
        console.error("❌ Lỗi trong service initPayment:", error);
        throw error;
    }
};

const confirmPayment = async (orderId, amount, paymentMethod = 'VIETQR', receptionistId = null, pointsRedeemed = 0) => {
    try {
        const numericOrderId = parseInt(String(orderId).replace(/\D/g, ''), 10);
        if (isNaN(numericOrderId)) {
            throw new Error("Invalid orderId");
        }

        // --- LOYALTY POINTS REDEMPTION ---
        if (pointsRedeemed > 0) {
            // Find service order to get customer ID
            const serviceOrder = await db.Service_Orders.findByPk(numericOrderId, {
                include: [{
                    model: db.Vehicles,
                    as: 'vehicle',
                    include: [{ model: db.Customers, as: 'customer' }]
                }]
            });

            if (serviceOrder && serviceOrder.vehicle && serviceOrder.vehicle.customer) {
                const customerId = serviceOrder.vehicle.customer.id;

                // Get config for max discount
                let maxPercentConfig = await db.Garage_Configurations.findOne({ where: { config_key: 'MAX_LOYALTY_DISCOUNT_PERCENT' } });
                if (!maxPercentConfig) {
                    maxPercentConfig = await db.Garage_Configurations.create({
                        config_key: 'MAX_LOYALTY_DISCOUNT_PERCENT',
                        config_value: '10',
                        description: 'Phần trăm tối đa của hóa đơn được phép thanh toán bằng điểm'
                    });
                }
                const maxPercent = parseInt(maxPercentConfig.config_value) || 10;

                // Calculate original amount (approximate based on amount + pointsRedeemed * 1000)
                // Actually the best way is to fetch the full total from tasks/quotation, but for now we trust frontend validation

                // Redeem points
                await loyaltyService.redeemPoints(customerId, pointsRedeemed, numericOrderId);
            }
        }
        // ---------------------------------

        let bookingPayment = await db.Booking_Payments.findOne({
            where: { order_id: numericOrderId }
        });

        if (!bookingPayment) {
            bookingPayment = await db.Booking_Payments.create({
                order_id: numericOrderId,
                amount: amount,
                payment_status: 'PAID',
                payment_method: paymentMethod,
                payment_gateway: 'BANK',
                paid_at: new Date()
            });
        } else {
            await bookingPayment.update({
                payment_status: 'PAID',
                payment_method: paymentMethod,
                amount: amount,
                paid_at: new Date()
            });
        }

        // Save transaction log
        await db.Payment_Transactions.create({
            payment_id: bookingPayment.id,
            gateway: 'BANK',
            transaction_date: new Date(),
            account_number: paymentMethod === 'CASH' ? 'CASH' : 'ONLINE',
            sub_account: paymentMethod === 'CASH' ? 'CASH' : 'ONLINE',
            amount_in: amount,
            amount_out: 0,
            accumulated: amount,
            code: `${paymentMethod}-${Date.now()}`,
            transaction_content: `Thanh toán ${paymentMethod === 'CASH' ? 'tiền mặt' : 'chuyển khoản'} cho SO-${numericOrderId}`,
            raw_body: JSON.stringify({ orderId, amount, paymentMethod, pointsRedeemed })
        });

        // Add Loyalty Points (Earn points based on the actual cash amount paid)
        await loyaltyService.addPointsOnPayment(numericOrderId, amount);

        return { success: true, bookingPayment };
    } catch (error) {
        console.error("❌ Lỗi trong service confirmPayment:", error);
        throw error;
    }
};

module.exports = {
    handleSepayTransaction,
    checkPaymentStatus,
    initPayment,
    confirmPayment,
};
