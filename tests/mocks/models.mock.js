// tests/mocks/models.mock.js
// Mocks para modelos de MongoDB

// Mock para modelo User
const createMockUser = (data = {}) => ({
  _id: 'mock_user_id_123',
  sqlUserId: 1,
  nombre_usuario: 'test_user',
  correo: 'test@test.com',
  tipo_usuario: 'ONG',
  activo: true,
  ultimoAcceso: null,
  sesiones: [],
  save: jest.fn().mockResolvedValue(true),
  comparePassword: jest.fn().mockResolvedValue(true),
  toSafeObject: jest.fn().mockReturnValue({
    id: 'mock_user_id_123',
    nombre_usuario: 'test_user',
    correo: 'test@test.com',
    tipo_usuario: 'ONG'
  }),
  ...data
});

const mockUserModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn()
};

// Mock para modelo Evento
const createMockEvento = (data = {}) => ({
  _id: 'mock_evento_id_123',
  sqlEventoId: 1,
  titulo: 'Evento Mock',
  descripcion: 'Descripción del evento mock',
  fechaInicio: new Date('2024-12-31'),
  fechaFinal: null,
  estado: 'publicado',
  activo: true,
  ongId: 1,
  participantes: [],
  imagenesPromocionales: [],
  metricas: {
    totalInscritos: 0,
    totalAsistentes: 0,
    porcentajeAsistencia: 0
  },
  save: jest.fn().mockResolvedValue(true),
  toObject: jest.fn().mockReturnValue(data),
  agregarParticipante: jest.fn().mockResolvedValue(true),
  registrarAsistencia: jest.fn().mockResolvedValue(true),
  ...data
});

const mockEventoModel = {
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis()
  }),
  findById: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(null)
  }),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
  create: jest.fn(),
  aggregate: jest.fn().mockResolvedValue([]),
  eventosProximos: jest.fn().mockResolvedValue([])
};

// Mock para modelo MegaEvento
const createMockMegaEvento = (data = {}) => ({
  _id: 'mock_mega_evento_id_123',
  sqlMegaEventoId: 1,
  titulo: 'Mega Evento Mock',
  descripcion: 'Descripción del mega evento mock',
  fechaInicio: new Date('2024-12-31'),
  fechaFin: new Date('2025-01-02'),
  estado: 'planificacion',
  activo: true,
  ongOrganizadoraPrincipal: 1,
  ongsOrganizadoras: [],
  patrocinadores: [],
  imagenesPromocionales: [],
  metricas: {
    totalInscritos: 0,
    totalAsistentes: 0,
    totalOngsParticipantes: 0,
    totalPatrocinadores: 0
  },
  save: jest.fn().mockResolvedValue(true),
  toObject: jest.fn().mockReturnValue(data),
  cambiarEstado: jest.fn().mockResolvedValue(true),
  agregarPatrocinador: jest.fn().mockResolvedValue(true),
  agregarOngOrganizadora: jest.fn().mockResolvedValue(true),
  agregarParticipanteExterno: jest.fn().mockResolvedValue(true),
  ...data
});

const mockMegaEventoModel = {
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis()
  }),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn().mockResolvedValue(0),
  create: jest.fn(),
  aggregate: jest.fn().mockResolvedValue([])
};

module.exports = {
  // User mocks
  createMockUser,
  mockUserModel,
  
  // Evento mocks
  createMockEvento,
  mockEventoModel,
  
  // MegaEvento mocks
  createMockMegaEvento,
  mockMegaEventoModel
};