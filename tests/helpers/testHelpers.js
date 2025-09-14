// tests/helpers/testHelpers.js
// Funciones helper para testing

/**
 * Crea un mock request object para testing
 */
const createMockRequest = (body = {}, params = {}, query = {}, files = [], headers = {}) => ({
  body,
  params,
  query,
  files,
  headers: {
    'user-agent': 'test-agent',
    'authorization': 'Bearer test_token',
    ...headers
  },
  user: { 
    userId: 'mock_user_id_123',
    sqlUserId: 1,
    tipo_usuario: 'ONG'
  },
  ip: '127.0.0.1',
  connection: {
    remoteAddress: '127.0.0.1'
  }
});

/**
 * Crea un mock response object para testing
 */
const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * Crea mock files para testing de upload
 */
const createMockFiles = (count = 1) => {
  const files = [];
  for (let i = 0; i < count; i++) {
    files.push({
      fieldname: 'images',
      originalname: `test_image_${i + 1}.jpg`,
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: Buffer.from(`fake image data ${i + 1}`),
      size: 1024 * (i + 1)
    });
  }
  return files;
};

/**
 * Crea mock data para usuario
 */
const createMockUserData = (type = 'ONG', overrides = {}) => {
  const baseData = {
    nombre_usuario: 'test_user',
    correo: 'test@test.com',
    contrasena: 'password123',
    tipo_usuario: type
  };

  const typeSpecificData = {
    'ONG': {
      nombre_ong: 'ONG Test',
      NIT: '123456789',
      descripcion: 'ONG de prueba'
    },
    'Empresa': {
      nombre_empresa: 'Empresa Test',
      NIT: '987654321',
      descripcion: 'Empresa de prueba'
    },
    'Integrante externo': {
      nombres: 'Juan',
      apellidos: 'Pérez',
      email: 'juan@test.com',
      PhoneNumber: '12345678'
    },
    'Super admin': {
      nivel_acceso: 'super_admin'
    }
  };

  return {
    ...baseData,
    ...typeSpecificData[type],
    ...overrides
  };
};

/**
 * Crea mock data para evento
 */
const createMockEventoData = (overrides = {}) => ({
  titulo: 'Evento Test',
  descripcion: 'Descripción del evento de prueba',
  fechaInicio: '2024-12-31T10:00:00Z',
  fechaFinal: '2024-12-31T18:00:00Z',
  locacion: {
    direccion: 'Calle Test 123',
    ciudad: 'Santa Cruz',
    tipoLocacion: 'presencial'
  },
  tipoEvento: 'social',
  ongId: 1,
  capacidadMaxima: 100,
  inscripcionAbierta: true,
  patrocinadores: [],
  auspiciadores: [],
  estado: 'borrador',
  ...overrides
});

/**
 * Crea mock data para mega evento
 */
const createMockMegaEventoData = (overrides = {}) => ({
  titulo: 'Mega Evento Test',
  descripcion: 'Descripción del mega evento de prueba',
  fechaInicio: '2024-12-31T08:00:00Z',
  fechaFin: '2025-01-02T20:00:00Z',
  ubicacion: {
    direccion: 'Plaza Principal',
    ciudad: 'Santa Cruz',
    tipoLocacion: 'presencial'
  },
  categoria: 'social',
  ongOrganizadoraPrincipal: 1,
  capacidadMaxima: 1000,
  requiereAprobacion: false,
  certificacionDisponible: true,
  patrocinadores: [],
  ongsOrganizadoras: [],
  tags: ['test', 'mega-evento'],
  ...overrides
});

/**
 * Simula delay para testing async
 */
const delay = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Genera datos aleatorios para testing
 */
const generateRandomData = {
  email: () => `test_${Math.random().toString(36).substr(2, 9)}@test.com`,
  username: () => `user_${Math.random().toString(36).substr(2, 9)}`,
  nit: () => Math.floor(Math.random() * 999999999).toString(),
  phone: () => Math.floor(Math.random() * 99999999).toString(),
  string: (length = 10) => Math.random().toString(36).substr(2, length)
};

/**
 * Validadores para testing
 */
const validators = {
  isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  isValidDate: (date) => !isNaN(Date.parse(date)),
  isValidObjectId: (id) => /^[0-9a-fA-F]{24}$/.test(id),
  isValidJWT: (token) => {
    const parts = token.split('.');
    return parts.length === 3;
  }
};

/**
 * Funciones de comparación para testing
 */
const matchers = {
  toContainSuccessResponse: (received) => ({
    message: () => `expected response to contain success: true`,
    pass: received && received.success === true
  }),
  toContainErrorResponse: (received) => ({
    message: () => `expected response to contain success: false`,
    pass: received && received.success === false
  })
};

/**
 * Configuración de base de datos mock
 */
const setupMockDatabase = () => {
  // Configurar mocks de base de datos aquí si es necesario
  console.log('🗄️ Configurando base de datos mock...');
};

/**
 * Limpieza de base de datos mock
 */
const cleanupMockDatabase = () => {
  // Limpiar mocks de base de datos aquí si es necesario
  console.log('🧹 Limpiando base de datos mock...');
};

module.exports = {
  // Creators
  createMockRequest,
  createMockResponse,
  createMockFiles,
  createMockUserData,
  createMockEventoData,
  createMockMegaEventoData,
  
  // Utilities
  delay,
  generateRandomData,
  validators,
  matchers,
  
  // Database helpers
  setupMockDatabase,
  cleanupMockDatabase
};