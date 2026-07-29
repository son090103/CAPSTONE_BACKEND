const db = require("../../../models");


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

        const bgMatch = content?.match(/BG[- ]?(\d+)/i);
        if (bgMatch) {
            const quotationId = parseInt(bgMatch[1], 10);
            console.log(`✅ [Sepay Deposit] Tìm thấy mã Báo giá cọc: #${quotationId}`);
            const quotation = await db.Quotations.findByPk(quotationId, {
                include: [{ model: db.Task, as: "task" }]
            });

            if (quotation) {
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

                    // Cập nhật status của các phụ tùng đặt riêng (Quotation_Details) thành WAITING_STOCK
                    const { Op } = require("sequelize");
                    await db.Quotation_Details.update(
                        { status: "WAITING_STOCK" },
                        {
                            where: {
                                quotation_id: quotationId,
                                [Op.or]: [
                                    { custom_item_name: { [Op.ne]: null } },
                                    { status: "WAITING_DEPOSIT" }
                                ]
                            }
                        }
                    );

                    console.log(`🎉 [Sepay Deposit] Cập nhật cọc deposit_paid_at và Quotation_Details (WAITING_STOCK) thành công cho Báo giá #${quotationId}`);
                } else {
                    console.warn(`⚠️ [Sepay Deposit] Số tiền chuyển (${transferAmount} VND) nhỏ hơn số tiền cọc (${quotation.deposit_amount} VND)`);
                }
            }
        }

        // Đơn lịch hẹn / Sửa chữa chung (AGM-xxx / SO-xxx)
        const match = content?.match(/(?:AGM|SO)[- ]?(\d+)/i);

        if (!bgMatch && match) {
            bookingCode = match[1];
            console.log(`✅ [Sepay] Tìm thấy mã đơn/lịch hẹn: ${bookingCode}`);
            bookingPayment = await db.Booking_Payments.findOne({
                where: { order_id: parseInt(bookingCode, 10), payment_status: 'PENDING' }
            });

            // Nếu chưa có bản ghi Booking_Payments cho đơn này, tự động khởi tạo nếu Service_Order tồn tại
            if (!bookingPayment) {
                const serviceOrder = await db.Service_Orders.findByPk(parseInt(bookingCode, 10));
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
                console.log(`✅ [Sepay Fallback] Khớp số tiền cọc ${transferAmount} VND với Báo giá #${pendingQuotation.id}`);
                await pendingQuotation.update({
                    deposit_paid_at: transactionDate ? new Date(transactionDate) : new Date()
                });

                await db.Quotation_Details.update(
                    { status: "WAITING_STOCK" },
                    {
                        where: {
                            quotation_id: pendingQuotation.id,
                            [Op.or]: [
                                { custom_item_name: { [Op.ne]: null } },
                                { status: "WAITING_DEPOSIT" }
                            ]
                        }
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

                if (bookingPayment) {
                    console.log(`✅ [Sepay Fallback] Đã tự động map với đơn hàng ID: ${bookingPayment.order_id} do khớp số tiền.`);
                } else {
                    console.log(`❌ [Sepay] Không tìm thấy đơn hàng/báo giá nào đang chờ thanh toán khớp với số tiền ${transferAmount} VND. Cần kiểm tra thủ công.`);
                }
            }
        }

        // Cập nhật trạng thái nếu tìm thấy
        if (bookingPayment) {
            await bookingPayment.update({
                payment_status: 'PAID',
                transaction_code: code,
                paid_at: transactionDate ? new Date(transactionDate) : new Date(),
            });
            console.log(`✅ [Sepay] Đã cập nhật Booking_Payments (ID: ${bookingPayment.id}) thành PAID`);
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
        if (!created && payment.payment_status !== 'PAID') {
            await payment.update({ amount: amount, payment_status: 'PENDING' });
        }
        return payment;
    } catch (error) {
        console.error("❌ Lỗi trong service initPayment:", error);
        throw error;
    }
};

const confirmPayment = async (orderId, amount, paymentMethod = 'VIETQR') => {
    try {
        const numericOrderId = parseInt(String(orderId).replace(/\D/g, ''), 10);
        if (isNaN(numericOrderId)) {
            throw new Error("Invalid orderId");
        }

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
            raw_body: JSON.stringify({ orderId, amount, paymentMethod })
        });

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
