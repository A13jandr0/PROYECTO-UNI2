// tests/setup.js
// Configuración global para Jest

// Configurar variables de entorno para testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
process.env.SQL_SERVER = 'test_server';
process.env.SQL_DATABASE = 'test_db';
process.env.SQL_USER = 'test_user';
process.env.SQL_PASSWORD = 'test_password';

// Configurar timeouts globales
jest.setTimeout(10000);

// Mock global para console.log en pruebas (opcional)
global.console = {
  ...console,
  // Silenciar logs durante pruebas
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: (...args) => {
    // Mantener errores para debugging
    console.error(...args);
  }
};

// Configuración para manejar promesas no resueltas
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Limpiar mocks después de cada prueba
afterEach(() => {
  jest.clearAllMocks();
});

// Configuración global para beforeAll/afterAll
beforeAll(async () => {
  console.log('🧪 Iniciando suite de pruebas...');
});

afterAll(async () => {
  console.log('✅ Suite de pruebas completada');
});