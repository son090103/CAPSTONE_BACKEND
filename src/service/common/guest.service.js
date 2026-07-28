const db = require("../../../models");
const Service_Categories = db.Service_Categories;
const Service_Catalog = db.Service_Catalog;
const Service_Combo = db.Service_Combo;
const { mapServicePrices } = require("../../util/calculateServicePrice.util");
const { Op } = require("sequelize");

// Categories
module.exports.getServiceCategories = async (lang = 'vi') => {
    const include = [];
    if (lang !== 'vi' && db.Service_Category_Translations) {
        include.push({
            model: db.Service_Category_Translations,
            as: 'translations',
            where: { languageId: lang },
            required: false
        });
    }

    const categories = await Service_Categories.findAll({
        attributes: ['id', 'category_name'],
        include
    });

    if (lang !== 'vi') {
        return categories.map(cat => {
            const raw = cat.toJSON();
            if (raw.translations && raw.translations.length > 0) {
                raw.category_name = raw.translations[0].name || raw.category_name;
            }
            delete raw.translations;
            return raw;
        });
    }
    return categories;
};

// Catalogs (Single Services)
module.exports.getServiceCatalog = async (lang = 'vi', page = 1, limit = 16, search = '', categoryId = null) => {
    const offset = (page - 1) * limit;

    const whereCondition = {
        is_active: true
    };

    if (categoryId) {
        whereCondition.category_id = categoryId;
    }

    if (search) {
        whereCondition[Op.or] = [
            { service_name: { [Op.like]: `%${search}%` } },
            { description: { [Op.like]: `%${search}%` } }
        ];
    }
    const include = [
        {
            model: Service_Categories,
            as: 'category',
            attributes: ['category_name']
        }
    ];

    if (lang !== 'vi' && db.Service_Catalog_Translations) {
        include.push({
            model: db.Service_Catalog_Translations,
            as: 'translations',
            where: { languageId: lang },
            required: false
        });
    }

    const { count, rows: serviceCatalog } = await Service_Catalog.findAndCountAll({
        where: whereCondition,
        attributes: ['id', 'category_id', 'service_name', 'description', 'estimated_duration', 'labor_price', 'spare_part_id', 'is_active'],
        include,
        limit,
        offset,
        distinct: true
    });

    let mappedCatalogs = mapServicePrices(serviceCatalog);

    if (lang !== 'vi') {
        mappedCatalogs = mappedCatalogs.map(cat => {
            const raw = cat;
            if (raw.translations && raw.translations.length > 0) {
                raw.service_name = raw.translations[0].name || raw.service_name;
                raw.description = raw.translations[0].description || raw.description;
            }
            delete raw.translations;
            return raw;
        });
    }

    return {
        items: mappedCatalogs,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page
    };
};

// Combos
module.exports.getServiceCombos = async (lang = 'vi', page = 1, limit = 16, search = '') => {
    const offset = (page - 1) * limit;

    const whereCondition = {
        is_active: true
    };

    if (search) {
        whereCondition[Op.or] = [
            { combo_name: { [Op.like]: `%${search}%` } },
            { description: { [Op.like]: `%${search}%` } }
        ];
    }

    const include = [
        {
            model: Service_Catalog,
            as: "catalogs",
            attributes: [
                "id",
                "category_id",
                "service_name",
                "description",
                "estimated_duration",
                "labor_price",
                "is_active",
            ],
            through: { attributes: [] },
            include: [
                {
                    model: Service_Categories,
                    as: "category",
                    attributes: ["id", "category_name"],
                },
            ],
        },
    ];

    if (lang !== 'vi' && db.Service_Combo_Translations) {
        include.push({
            model: db.Service_Combo_Translations,
            as: 'translations',
            where: { languageId: lang },
            required: false
        });

        if (db.Service_Catalog_Translations) {
            include[0].include.push({
                model: db.Service_Catalog_Translations,
                as: 'translations',
                where: { languageId: lang },
                required: false
            });
        }
    }

    const { count, rows: combos } = await Service_Combo.findAndCountAll({
        where: whereCondition,
        attributes: ["id", "combo_name", "description", "is_active", "createdAt", "updatedAt"],
        include,
        order: [["createdAt", "DESC"]],
        limit,
        offset,
        distinct: true
    });

    let mappedCombos = combos;

    if (lang !== 'vi') {
        mappedCombos = combos.map(combo => {
            const raw = combo.toJSON();
            if (raw.translations && raw.translations.length > 0) {
                raw.combo_name = raw.translations[0].combo_name || raw.combo_name;
                raw.description = raw.translations[0].description || raw.description;
            }
            delete raw.translations;

            // Dịch luôn các catalogs con bên trong
            if (raw.catalogs && raw.catalogs.length > 0) {
                raw.catalogs = raw.catalogs.map(catalog => {
                    if (catalog.translations && catalog.translations.length > 0) {
                        catalog.service_name = catalog.translations[0].name || catalog.service_name;
                        catalog.description = catalog.translations[0].description || catalog.description;
                    }
                    delete catalog.translations;
                    return catalog;
                });
            }
            return raw;
        });
    }

    return {
        items: mappedCombos,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page
    };
};

module.exports.checkLicensePlate = async (licensePlate) => {
    const vehicle = await db.Vehicles.findOne({
        where: { license_plate: licensePlate }
    });
    return !!vehicle;
};
