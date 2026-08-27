const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Mock vectorStoreService to avoid external calls
jest.mock('../../../service/ai/vectorStore.service', () => ({
  syncAllServicesToPinecone: jest.fn().mockResolvedValue(true),
}));

// Mock models (Sequelize) used in the service
jest.mock('../../../../models', () => {
  const Service_Categories = {
    findOne: jest.fn()
  };
  const Service_Catalog = {
    create: jest.fn()
  };
  return {
    Service_Categories,
    Service_Catalog,
    sequelize: {
      transaction: jest.fn().mockResolvedValue({ commit: jest.fn().mockResolvedValue(true), rollback: jest.fn().mockResolvedValue(true) })
    },
    // Other models possibly accessed by applyCatalogTranslations
    Languages: null,
    Service_Catalog_Translations: null,
  };
});

const svc = require('../../../service/admin/serviceCatalog.service');
const db = require('../../../../models');

describe('serviceCatalog.service helpers', () => {
  test('parseNumber handles numbers and formatted strings', () => {
    expect(svc.parseNumber('150000')).toBe(150000);
    expect(svc.parseNumber('150.000')).toBe(150000);
    expect(svc.parseNumber('150,000')).toBe(150000);
    expect(svc.parseNumber('1.234.567')).toBe(1234567);
    expect(svc.parseNumber(null, 5)).toBe(5);
    expect(svc.parseNumber('', 10)).toBe(10);
  });

  test('normalizeRow normalizes headers and decodes mojibake only when present', () => {
    const input = {
      'Tên dịch vụ': 'Service A',
      'Mô tả': 'Mô tả A',
      'Thời gian (phút)': 60,
      'Giá': '150000'
    };
    const out = svc.normalizeRow(input);
    // keys expected after normalization
    expect(out).toHaveProperty('ten_dich_vu');
    expect(out.ten_dich_vu).toBe('Service A');
    expect(out.mo_ta).toBe('Mô tả A');
    expect(out.thoi_gian_phut).toBe(60);
    expect(out.gia).toBe('150000');
  });

  test('validateLaborPrice applies the default-inspection pricing rule', () => {
    expect(svc.validateLaborPrice(0, true)).toBe(0);
    expect(() => svc.validateLaborPrice(1000, true)).toThrow();
    expect(svc.validateLaborPrice(1000, false)).toBe(1000);
    expect(() => svc.validateLaborPrice(0, false)).toThrow();
  });
});

describe('importServiceCatalog integration (mocked DB)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('imports CSV buffer and creates entries when categories exist', async () => {
    // Arrange: mock category lookup to return id
    // Always return a category so create path proceeds
    db.Service_Categories.findOne.mockResolvedValue({ id: 1, category_name: 'Bảo dưỡng định kỳ' });

    db.Service_Catalog.create.mockResolvedValue({ id: 100 });

    const csv = 'Tên dịch vụ,Mô tả,Danh mục,Giá,Thời gian (phút),Trạng thái\nTest A,Desc A,Bảo dưỡng định kỳ,150000,60,true\nTest B,Desc B,Bảo dưỡng định kỳ,120000,45,false\n';
    const buffer = Buffer.from(csv, 'utf8');

    const result = await svc.importServiceCatalog(buffer, 'test.csv');

    // Assert
    expect(result.successCount).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(db.Service_Catalog.create).toHaveBeenCalledTimes(2);
  });
});
