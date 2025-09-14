// tests/controllers/megaEventos.test.js
const {
  createMegaEvent,
  getAllMegaEvents,
  getMegaEventById,
  changeMegaEventStatus,
  registerCompanySponsorship,
  registerExternalParticipant,
  addOrganizerOng,
  getMegaEventStatistics
} = require('../../controllers/MegaEvento.controller');

const {
  createMockRequest,
  createMockResponse,
  createMockMegaEventoData,
  createMockFiles
} = require('../helpers/testHelpers');

// Mock de dependencias
jest.mock('../../config/db', () => require('../mocks/db.mock'));
jest.mock('../../models/MegaEvento.model');
jest.mock('../../models/user'); // Asegúrate de que el modelo de usuario esté mockeado si se usa para autenticación/autorización
jest.mock('sharp');

const MegaEvento = require('../../models/MegaEvento.model');
const User = require('../../models/user'); // Asegúrate de tenerlo aquí si tu controlador lo usa
const { poolPromise } = require('../../config/db');
const sharp = require('sharp');

describe('🚀 Controlador de Mega Eventos', () => {
  let req, res, mockPool;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    jest.clearAllMocks();

    // ************ AÑADE ESTO PARA SIMULAR UN USUARIO AUTENTICADO ************
    // Esto es crucial para pasar las comprobaciones de autorización (403)
    req.user = {
      userId: 1, // ID del usuario autenticado
      ongId: 1, // Asume que esta ONG es la que tiene permisos para crear/gestionar mega eventos
      tipo_usuario: 'ONG' // O el rol específico que tu aplicación usa para la autorización (e.g., 'ADMIN', 'ONG_ADMIN')
    };
    // ************ FIN DEL AÑADIDO ************

    // Setup mock pool
    mockPool = {
      transaction: jest.fn().mockReturnValue({
        begin: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        request: jest.fn().mockReturnValue({
          input: jest.fn().mockReturnThis(),
          query: jest.fn().mockResolvedValue({
            recordset: [{ MegaEventoID: 1 }]
          })
        })
      }),
      request: jest.fn().mockReturnValue({
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({
          recordset: [{ tipo_usuario: 'ONG' }] // Asumiendo un tipo de usuario para las pruebas
        })
      })
    };

    poolPromise.then = jest.fn().mockImplementation(callback => callback(mockPool));

    // Mock sharp
    sharp.mockReturnValue({
      resize: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed image'))
    });
  });

  describe('createMegaEvent', () => {
    test('✅ Debe crear mega evento exitosamente', async () => {
      // Arrange
      req.body = createMockMegaEventoData();
      req.files = createMockFiles(); // Si el controlador espera files

      const mockMegaEvento = {
        _id: 'mega_evento_id_123',
        titulo: 'Mega Evento Test',
        save: jest.fn().mockResolvedValue(true),
        imagenesPromocionales: [] // Asegúrate de que esto coincida con la estructura de tu modelo
      };

      MegaEvento.mockImplementation(() => mockMegaEvento);

      // Act
      await createMegaEvent(req, res);

      // Assert
      expect(MegaEvento.mock.calls[0][0].ongOrganizadoraPrincipal).toBe(req.user.ongId); // Verifica que el ongId del usuario se use
      expect(mockMegaEvento.save).toHaveBeenCalled();
      expect(mockPool.transaction().request().input).toHaveBeenCalledWith('Titulo', expect.any(String), req.body.titulo);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Mega evento creado exitosamente.',
          megaEvento: expect.objectContaining({
            _id: 'mega_evento_id_123',
            titulo: 'Mega Evento Test'
          })
        })
      );
    });

    test('❌ Debe fallar si faltan campos requeridos', async () => {
      // Arrange
      req.body = { /* datos incompletos */ }; // No incluye un campo requerido como 'titulo'
      req.files = createMockFiles();

      // Act
      await createMegaEvent(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String) // Mensaje de error de validación
        })
      );
    });

    test('❌ Debe manejar error de base de datos', async () => {
      // Arrange
      req.body = createMockMegaEventoData();
      req.files = createMockFiles();

      MegaEvento.mockImplementation(() => {
        throw new Error('Database error'); // Simula un error al guardar
      });

      // Act
      await createMegaEvent(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Error interno del servidor.'
        })
      );
    });
  });

  describe('getAllMegaEvents', () => {
    test('✅ Debe obtener todos los mega eventos exitosamente', async () => {
      // Arrange
      const mockMegaEventos = [
        { _id: 'mega1', titulo: 'Mega Evento 1' },
        { _id: 'mega2', titulo: 'Mega Evento 2' },
      ];
      MegaEvento.find.mockResolvedValue(mockMegaEventos);

      // Act
      await getAllMegaEvents(req, res);

      // Assert
      expect(MegaEvento.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          megaEventos: mockMegaEventos
        })
      );
    });

    test('❌ Debe manejar errores del servidor al obtener todos los mega eventos', async () => {
      // Arrange
      MegaEvento.find.mockRejectedValue(new Error('Error de DB'));

      // Act
      await getAllMegaEvents(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Error interno del servidor.'
        })
      );
    });
  });

  describe('getMegaEventById', () => {
    test('✅ Debe obtener un mega evento por ID exitosamente', async () => {
      // Arrange
      req.params = { id: 'mega_evento_id_123' };
      const mockMegaEvento = { _id: 'mega_evento_id_123', titulo: 'Mega Evento Encontrado' };
      MegaEvento.findById.mockResolvedValue(mockMegaEvento);

      // Act
      await getMegaEventById(req, res);

      // Assert
      expect(MegaEvento.findById).toHaveBeenCalledWith('mega_evento_id_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          megaEvento: mockMegaEvento
        })
      );
    });

    test('❌ Debe retornar 404 si el mega evento no se encuentra', async () => {
      // Arrange
      req.params = { id: 'non_existent_id' };
      MegaEvento.findById.mockResolvedValue(null);

      // Act
      await getMegaEventById(req, res);

      // Assert
      expect(MegaEvento.findById).toHaveBeenCalledWith('non_existent_id');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Mega evento no encontrado.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor al obtener por ID', async () => {
      // Arrange
      req.params = { id: 'mega_evento_id_123' };
      MegaEvento.findById.mockRejectedValue(new Error('Error de DB'));

      // Act
      await getMegaEventById(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Error interno del servidor.'
        })
      );
    });
  });

  describe('changeMegaEventStatus', () => {
    test('✅ Debe cambiar el estado del mega evento exitosamente', async () => {
      // Arrange
      req.params = { id: 'mega_evento_id_123' };
      req.body = { activo: false }; // Cambiar a inactivo
      const mockMegaEvento = {
        _id: 'mega_evento_id_123',
        titulo: 'Mega Evento Test',
        activo: true, // Estado actual
        save: jest.fn().mockResolvedValue(true)
      };
      MegaEvento.findById.mockResolvedValue(mockMegaEvento);

      // Act
      await changeMegaEventStatus(req, res);

      // Assert
      expect(MegaEvento.findById).toHaveBeenCalledWith('mega_evento_id_123');
      expect(mockMegaEvento.activo).toBe(false); // Verifica que el estado se actualizó
      expect(mockMegaEvento.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Estado del mega evento actualizado exitosamente.',
          megaEvento: expect.objectContaining({
            _id: 'mega_evento_id_123',
            activo: false
          })
        })
      );
    });

    test('❌ Debe retornar 404 si el mega evento no se encuentra', async () => {
      // Arrange
      req.params = { id: 'non_existent_id' };
      req.body = { activo: false };
      MegaEvento.findById.mockResolvedValue(null);

      // Act
      await changeMegaEventStatus(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Mega evento no encontrado.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor al cambiar el estado', async () => {
      // Arrange
      req.params = { id: 'mega_evento_id_123' };
      req.body = { activo: false };
      MegaEvento.findById.mockRejectedValue(new Error('Error de DB'));

      // Act
      await changeMegaEventStatus(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Error interno del servidor.'
        })
      );
    });
  });

  // Pruebas para registerCompanySponsorship
  describe('registerCompanySponsorship', () => {
    test('✅ Debe registrar el patrocinio de una empresa exitosamente', async () => {
      // Arrange
      req.params = { megaEventoId: 'mega_evento_id_123' };
      req.body = { empresaId: 1, monto: 1000 };
      const mockMegaEvento = {
        _id: 'mega_evento_id_123',
        empresasPatrocinadoras: [],
        montoTotalRecaudado: 0,
        save: jest.fn().mockResolvedValue(true)
      };
      MegaEvento.findById.mockResolvedValue(mockMegaEvento);

      // Act
      await registerCompanySponsorship(req, res);

      // Assert
      expect(MegaEvento.findById).toHaveBeenCalledWith('mega_evento_id_123');
      expect(mockMegaEvento.empresasPatrocinadoras).toContain(1);
      expect(mockMegaEvento.montoTotalRecaudado).toBe(1000);
      expect(mockMegaEvento.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Patrocinio de empresa registrado exitosamente.'
        })
      );
    });

    test('❌ Debe fallar si el mega evento no se encuentra', async () => {
      // Arrange
      req.params = { megaEventoId: 'non_existent_id' };
      req.body = { empresaId: 1, monto: 1000 };
      MegaEvento.findById.mockResolvedValue(null);

      // Act
      await registerCompanySponsorship(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Mega evento no encontrado.'
        })
      );
    });
  });

  // Pruebas para registerExternalParticipant
  describe('registerExternalParticipant', () => {
    test('✅ Debe registrar un participante externo exitosamente', async () => {
      // Arrange
      req.params = { megaEventoId: 'mega_evento_id_123' };
      req.body = { nombre: 'Participante Test', email: 'test@example.com' };
      const mockMegaEvento = {
        _id: 'mega_evento_id_123',
        participantesExternos: [],
        save: jest.fn().mockResolvedValue(true)
      };
      MegaEvento.findById.mockResolvedValue(mockMegaEvento);

      // Act
      await registerExternalParticipant(req, res);

      // Assert
      expect(MegaEvento.findById).toHaveBeenCalledWith('mega_evento_id_123');
      expect(mockMegaEvento.participantesExternos.length).toBe(1);
      expect(mockMegaEvento.participantesExternos[0]).toMatchObject({ nombre: 'Participante Test', email: 'test@example.com' });
      expect(mockMegaEvento.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Participante externo registrado exitosamente.'
        })
      );
    });

    test('❌ Debe fallar si el mega evento no se encuentra', async () => {
      // Arrange
      req.params = { megaEventoId: 'non_existent_id' };
      req.body = { nombre: 'Participante Test', email: 'test@example.com' };
      MegaEvento.findById.mockResolvedValue(null);

      // Act
      await registerExternalParticipant(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Mega evento no encontrado.'
        })
      );
    });
  });

  // Pruebas para addOrganizerOng
  describe('addOrganizerOng', () => {
    test('✅ Debe añadir una ONG organizadora exitosamente', async () => {
      // Arrange
      req.params = { megaEventoId: 'mega_evento_id_123' };
      req.body = { ongId: 2 }; // ONG a añadir
      const mockMegaEvento = {
        _id: 'mega_evento_id_123',
        ongsOrganizadoras: [1], // ONG principal ya existente
        save: jest.fn().mockResolvedValue(true)
      };
      MegaEvento.findById.mockResolvedValue(mockMegaEvento);
      User.findOne.mockResolvedValue({ _id: 'user_id_ong_2', ongId: 2, tipo_usuario: 'ONG' }); // Simular que la ONG existe

      // Act
      await addOrganizerOng(req, res);

      // Assert
      expect(MegaEvento.findById).toHaveBeenCalledWith('mega_evento_id_123');
      expect(User.findOne).toHaveBeenCalledWith({ ongId: 2, tipo_usuario: 'ONG' });
      expect(mockMegaEvento.ongsOrganizadoras).toContain(2); // Verifica que la ONG se añadió
      expect(mockMegaEvento.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'ONG organizadora añadida exitosamente.'
        })
      );
    });

    test('❌ Debe fallar si la ONG ya es organizadora', async () => {
      // Arrange
      req.params = { megaEventoId: 'mega_evento_id_123' };
      req.body = { ongId: 1 }; // ONG ya existente
      const mockMegaEvento = {
        _id: 'mega_evento_id_123',
        ongsOrganizadoras: [1], // ONG ya existente
        save: jest.fn().mockResolvedValue(true)
      };
      MegaEvento.findById.mockResolvedValue(mockMegaEvento);
      User.findOne.mockResolvedValue({ _id: 'user_id_ong_1', ongId: 1, tipo_usuario: 'ONG' });


      // Act
      await addOrganizerOng(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'La ONG ya es organizadora de este mega evento.'
        })
      );
    });
  });

  describe('getMegaEventStatistics', () => {
    test('✅ Debe obtener estadísticas del mega evento', async () => {
      // Arrange
      req.params = { megaEventoId: 'mega_evento_id_123' };
      // req.query = { ongId: 1 }; // Esto ya debería venir de req.user

      const mockMegaEvento = {
        _id: 'mega_evento_id_123',
        titulo: 'Mega Evento Test',
        ongOrganizadoraPrincipal: req.user.ongId, // Asegúrate de que coincida con el ongId del usuario mockeado
        activo: true,
        participantesExternos: [
          { tipoParticipante: 'participante' },
          { tipoParticipante: 'voluntario' },
          { tipoParticipante: 'participante' }
        ],
        empresasPatrocinadoras: [{ empresaId: 1, monto: 1000 }, { empresaId: 2, monto: 2000 }],
        ongsOrganizadoras: [1, 2, 3],
        // Simular datos para estadísticas
        metricas: {
          totalParticipantes: 3,
          participantesPorTipo: { participante: 2, voluntario: 1 },
          totalPatrocinadores: 2,
          montoTotalRecaudado: 3000,
          totalOngsOrganizadoras: 3
        }
      };

      MegaEvento.findById.mockResolvedValue(mockMegaEvento);

      // Act
      await getMegaEventStatistics(req, res);

      // Assert
      expect(MegaEvento.findById).toHaveBeenCalledWith('mega_evento_id_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          estadisticas: expect.objectContaining({
            megaEvento: expect.objectContaining({
              titulo: 'Mega Evento Test'
            }),
            participacion: expect.objectContaining({
              totalParticipantes: 3,
              participantesPorTipo: expect.objectContaining({
                participante: 2,
                voluntario: 1
              })
            }),
            patrocinio: expect.objectContaining({
              totalPatrocinadores: 2,
              montoTotalRecaudado: 3000
            }),
            organizacion: expect.objectContaining({
              totalOngsOrganizadoras: 3
            })
          })
        })
      );
    });

    test('❌ Debe fallar si el mega evento no se encuentra', async () => {
      // Arrange
      req.params = { megaEventoId: 'non_existent_id' };
      MegaEvento.findById.mockResolvedValue(null);

      // Act
      await getMegaEventStatistics(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Mega evento no encontrado.'
        })
      );
    });

    test('❌ Debe fallar si no es el organizador principal o una ONG organizadora', async () => {
      // Arrange
      req.params = { megaEventoId: 'mega_evento_123' };
      // Cambiamos el ongId del usuario mockeado en este test específico para simular falta de autorización
      req.user = { userId: 99, ongId: 99, tipo_usuario: 'ONG' }; // Una ONG diferente

      const mockMegaEvento = {
        ongOrganizadoraPrincipal: 1, // Organizador original
        ongsOrganizadoras: [1, 2], // Otros organizadores
        activo: true
      };

      MegaEvento.findById.mockResolvedValue(mockMegaEvento);

      // Act
      await getMegaEventStatistics(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Acceso denegado. Solo organizadores pueden ver las estadísticas.'
        })
      );
    });
  });
});