/**
 * Hàm tiện ích để tính tổng tiền của một Dịch vụ
 * Tổng tiền = Tiền công (labor_price) + Tiền vật tư đi kèm (sparePart.retail_price)
 * 
 * @param {Object} serviceCatalog - Object service_catalog từ Database (đã eager-load sparePart)
 * @returns {Number} Tổng tiền
 */
function calculateTotalServicePrice(serviceCatalog) {
    if (!serviceCatalog) return 0;
    
    // Parse tiền công, mặc định là 0 nếu không có
    const laborPrice = parseFloat(serviceCatalog.labor_price) || 0;
    
    // Parse tiền vật tư, mặc định là 0 nếu không có phụ tùng đi kèm
    let partPrice = 0;
    if (serviceCatalog.sparePart && serviceCatalog.sparePart.retail_price) {
        partPrice = parseFloat(serviceCatalog.sparePart.retail_price);
    } else if (serviceCatalog.spare_part_id && serviceCatalog.part_price_temp) {
        // Dự phòng trường hợp có query raw truyền giá phụ tùng vào biến tạm
        partPrice = parseFloat(serviceCatalog.part_price_temp);
    }
    
    return laborPrice + partPrice;
}

/**
 * Hàm map dữ liệu dịch vụ để thêm thuộc tính total_price cho frontend dễ sử dụng
 * @param {Array} services - Mảng các service_catalog
 * @returns {Array} Mảng các service_catalog đã được gán thêm total_price
 */
function mapServicePrices(services) {
    if (!services || !Array.isArray(services)) return services;
    
    return services.map(service => {
        // Nếu là Sequelize Model instance, cần chuyển sang JSON object
        const rawService = typeof service.toJSON === 'function' ? service.toJSON() : service;
        
        // Tính tổng tiền
        rawService.total_price = calculateTotalServicePrice(rawService);
        
        return rawService;
    });
}

module.exports = {
    calculateTotalServicePrice,
    mapServicePrices
};
