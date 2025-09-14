// tests/mocks/db.mock.js
// Mock para SQL Server connection

const createMockRequest = () => ({
  input: jest.fn().mockReturnThis(),
  query: jest.fn().mockResolvedValue({
    recordset: []
  }),
  execute: jest.fn().mockResolvedValue({
    recordset: []
  })
});

const createMockTransaction = () => ({
  begin: jest.fn().mockResolvedValue(),
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue(),
  request: jest.fn().mockImplementation(() => createMockRequest())
});

const createMockPool = () => ({
  request: jest.fn().mockImplementation(() => createMockRequest()),
  transaction: jest.fn().mockImplementation(() => createMockTransaction()),
  close: jest.fn().mockResolvedValue(),
  connected: true
});

const mockPoolPromise = Promise.resolve(createMockPool());

// Mock para SQL types si los usas
const mockSql = {
  Int: 'Int',
  NVarChar: 'NVarChar',
  DateTime: 'DateTime',
  Bit: 'Bit',
  Decimal: 'Decimal',
  Text: 'Text'
};

module.exports = {
  poolPromise: mockPoolPromise,
  createMockPool,
  createMockRequest,
  createMockTransaction,
  sql: mockSql
};