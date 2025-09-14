// tests/controllers/eventos.test.js
const {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  registerParticipant,
  changeEventStatus,
  getEventStatistics
} = require('../../controllers/events.controller');

const {
  createMockRequest,
  createMockResponse,
  createMockEventoData,
  createMockFiles
} = require('../helpers/testHelpers');

// Mock de dependencias
jest.mock('../../config/db', () => require('../mocks/db.mock'));
jest.mock('../../models/evento.model');
jest.mock('../../models/user'); // Asegúrate de que el modelo de usuario esté mockeado
jest.mock('sharp');

const Evento = require('../../models/evento.model');
const User = require('../../models/user');
const { poolPromise } = require('../../config/db');
const sharp = require('sharp');

describe('🎪 Controlador de Eventos', () => {
  let req, res, mockPool;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    jest.clearAllMocks();

    // ************ AÑADE ESTO PARA SIMULAR UN USUARIO AUTENTICADO ************
    // Esto es crucial para pasar las comprobaciones de autorización (403)
    req.user = {
      userId: 1, // ID del usuario autenticado
      ongId: 1, // Asume que esta ONG es la que tiene permisos para crear/gestionar eventos
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
            recordset: [{ EventoID: 1 }]
          })
        })
      }),
      request: jest.fn().mockReturnValue({
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({
          recordset: [{ tipo_usuario: 'ONG' }]
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

  describe('createEvent', () => {
    test('✅ Debe crear evento exitosamente', async () => {
      // Arrange
      req.body = createMockEventoData();
      req.files = createMockFiles(); // Si el controlador espera files

      const mockEvento = {
        _id: 'evento_id_123',
        titulo: 'Evento Test',
        save: jest.fn().mockResolvedValue(true),
        imagenesPromocionales: []
      };

      Evento.mockImplementation(() => mockEvento);

      // Act
      await createEvent(req, res);

      // Assert
      expect(Evento.mock.calls[0][0].ongId).toBe(req.user.ongId); // Verifica que el ongId del usuario se use
      expect(mockEvento.save).toHaveBeenCalled();
      expect(mockPool.transaction().request().input).toHaveBeenCalledWith('Titulo', expect.any(String), req.body.titulo);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Evento creado exitosamente.',
          evento: expect.objectContaining({
            _id: 'evento_id_123',
            titulo: 'Evento Test'
          })
        })
      );
    });

    test('❌ Debe fallar si faltan campos requeridos', async () => {
      // Arrange
      req.body = { /* datos incompletos */ }; // No incluye un campo requerido como 'titulo'
      req.files = createMockFiles();

      // Act
      await createEvent(req, res);

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
      req.body = createMockEventoData();
      req.files = createMockFiles();

      Evento.mockImplementation(() => {
        throw new Error('Database error'); // Simula un error al guardar
      });

      // Act
      await createEvent(req, res);

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

  describe('getAllEvents', () => {
    test('✅ Debe obtener todos los eventos exitosamente', async () => {
      // Arrange
      const mockEventos = [
        { _id: 'event1', titulo: 'Evento 1' },
        { _id: 'event2', titulo: 'Evento 2' },
      ];
      Evento.find.mockResolvedValue(mockEventos);

      // Act
      await getAllEvents(req, res);

      // Assert
      expect(Evento.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          eventos: mockEventos
        })
      );
    });

    test('❌ Debe manejar errores del servidor al obtener todos los eventos', async () => {
      // Arrange
      Evento.find.mockRejectedValue(new Error('Error de DB'));

      // Act
      await getAllEvents(req, res);

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

  describe('getEventById', () => {
    test('✅ Debe obtener un evento por ID exitosamente', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      const mockEvento = { _id: 'evento_id_123', titulo: 'Evento Encontrado' };
      Evento.findById.mockResolvedValue(mockEvento);

      // Act
      await getEventById(req, res);

      // Assert
      expect(Evento.findById).toHaveBeenCalledWith('evento_id_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          evento: mockEvento
        })
      );
    });

    test('❌ Debe retornar 404 si el evento no se encuentra', async () => {
      // Arrange
      req.params = { id: 'non_existent_id' };
      Evento.findById.mockResolvedValue(null);

      // Act
      await getEventById(req, res);

      // Assert
      expect(Evento.findById).toHaveBeenCalledWith('non_existent_id');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Evento no encontrado.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor al obtener por ID', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      Evento.findById.mockRejectedValue(new Error('Error de DB'));

      // Act
      await getEventById(req, res);

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

  describe('updateEvent', () => {
    test('✅ Debe actualizar un evento exitosamente', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      req.body = { titulo: 'Nuevo Titulo', descripcion: 'Nueva Descripcion' };
      req.files = createMockFiles();

      const mockEvento = {
        _id: 'evento_id_123',
        titulo: 'Titulo Antiguo',
        descripcion: 'Descripcion Antigua',
        ongId: req.user.ongId, // Asegúrate de que el evento pertenece a la ONG del usuario
        save: jest.fn().mockResolvedValue(true),
        imagenesPromocionales: []
      };

      Evento.findById.mockResolvedValue(mockEvento);

      // Act
      await updateEvent(req, res);

      // Assert
      expect(Evento.findById).toHaveBeenCalledWith('evento_id_123');
      expect(mockEvento.titulo).toBe(req.body.titulo);
      expect(mockEvento.descripcion).toBe(req.body.descripcion);
      expect(mockEvento.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Evento actualizado exitosamente.',
          evento: expect.objectContaining({
            _id: 'evento_id_123',
            titulo: 'Nuevo Titulo'
          })
        })
      );
    });

    test('❌ Debe retornar 404 si el evento no se encuentra para actualizar', async () => {
      // Arrange
      req.params = { id: 'non_existent_id' };
      req.body = { titulo: 'Nuevo Titulo' };
      Evento.findById.mockResolvedValue(null);

      // Act
      await updateEvent(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Evento no encontrado.'
        })
      );
    });

    test('❌ Debe retornar 403 si el usuario no es el dueño de la ONG del evento', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      req.body = { titulo: 'Nuevo Titulo' };
      // Simula que el evento pertenece a otra ONG
      const mockEvento = {
        _id: 'evento_id_123',
        ongId: 999, // ONG diferente al usuario mockeado en req.user.ongId (que es 1)
        save: jest.fn().mockResolvedValue(true)
      };
      Evento.findById.mockResolvedValue(mockEvento);

      // Act
      await updateEvent(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Acceso denegado. No eres el dueño de esta ONG.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor al actualizar', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      req.body = { titulo: 'Nuevo Titulo' };
      Evento.findById.mockRejectedValue(new Error('Error de DB'));

      // Act
      await updateEvent(req, res);

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

  describe('deleteEvent', () => {
    test('✅ Debe eliminar un evento exitosamente', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      const mockEvento = {
        _id: 'evento_id_123',
        ongId: req.user.ongId, // Asegúrate de que el evento pertenece a la ONG del usuario
        deleteOne: jest.fn().mockResolvedValue(true) // O .remove() o .delete() dependiendo de tu Mongoose
      };
      Evento.findById.mockResolvedValue(mockEvento);

      // Act
      await deleteEvent(req, res);

      // Assert
      expect(Evento.findById).toHaveBeenCalledWith('evento_id_123');
      expect(mockEvento.deleteOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Evento eliminado exitosamente.'
        })
      );
    });

    test('❌ Debe retornar 404 si el evento no se encuentra para eliminar', async () => {
      // Arrange
      req.params = { id: 'non_existent_id' };
      Evento.findById.mockResolvedValue(null);

      // Act
      await deleteEvent(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Evento no encontrado.'
        })
      );
    });

    test('❌ Debe retornar 403 si el usuario no es el dueño de la ONG del evento', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      const mockEvento = {
        _id: 'evento_id_123',
        ongId: 999, // ONG diferente
        deleteOne: jest.fn().mockResolvedValue(true)
      };
      Evento.findById.mockResolvedValue(mockEvento);

      // Act
      await deleteEvent(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Acceso denegado. No eres el dueño de esta ONG.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor al eliminar', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      Evento.findById.mockRejectedValue(new Error('Error de DB'));

      // Act
      await deleteEvent(req, res);

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

  describe('registerParticipant', () => {
    test('✅ Debe registrar un participante en un evento exitosamente', async () => {
      // Arrange
      req.params = { eventoId: 'evento_id_123' };
      req.body = { userId: 'user_id_participante', tipoParticipante: 'voluntario' };
      const mockEvento = {
        _id: 'evento_id_123',
        participantes: [],
        save: jest.fn().mockResolvedValue(true)
      };
      const mockUser = {
        _id: 'user_id_participante',
        email: 'participant@test.com'
      };
      Evento.findById.mockResolvedValue(mockEvento);
      User.findById.mockResolvedValue(mockUser);

      // Act
      await registerParticipant(req, res);

      // Assert
      expect(Evento.findById).toHaveBeenCalledWith('evento_id_123');
      expect(User.findById).toHaveBeenCalledWith('user_id_participante');
      expect(mockEvento.participantes).toContainEqual({ userId: 'user_id_participante', tipoParticipante: 'voluntario' });
      expect(mockEvento.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Participante registrado exitosamente.'
        })
      );
    });

    test('❌ Debe fallar si el evento no se encuentra', async () => {
      // Arrange
      req.params = { eventoId: 'non_existent_id' };
      req.body = { userId: 'user_id_participante', tipoParticipante: 'voluntario' };
      Evento.findById.mockResolvedValue(null);

      // Act
      await registerParticipant(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Evento no encontrado.'
        })
      );
    });

    test('❌ Debe fallar si el usuario participante no se encuentra', async () => {
      // Arrange
      req.params = { eventoId: 'evento_id_123' };
      req.body = { userId: 'non_existent_user', tipoParticipante: 'voluntario' };
      const mockEvento = {
        _id: 'evento_id_123',
        participantes: [],
        save: jest.fn().mockResolvedValue(true)
      };
      Evento.findById.mockResolvedValue(mockEvento);
      User.findById.mockResolvedValue(null); // Usuario no encontrado

      // Act
      await registerParticipant(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Usuario participante no encontrado.'
        })
      );
    });

    test('❌ Debe fallar si el participante ya está registrado', async () => {
      // Arrange
      req.params = { eventoId: 'evento_id_123' };
      req.body = { userId: 'user_id_participante', tipoParticipante: 'voluntario' };
      const mockEvento = {
        _id: 'evento_id_123',
        participantes: [{ userId: 'user_id_participante', tipoParticipante: 'voluntario' }],
        save: jest.fn().mockResolvedValue(true)
      };
      const mockUser = { _id: 'user_id_participante' };
      Evento.findById.mockResolvedValue(mockEvento);
      User.findById.mockResolvedValue(mockUser);

      // Act
      await registerParticipant(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'El participante ya está registrado en este evento.'
        })
      );
    });
  });

  describe('changeEventStatus', () => {
    test('✅ Debe cambiar el estado del evento exitosamente', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      req.body = { activo: false }; // Cambiar a inactivo
      const mockEvento = {
        _id: 'evento_id_123',
        titulo: 'Evento Test',
        ongId: req.user.ongId,
        activo: true, // Estado actual
        save: jest.fn().mockResolvedValue(true)
      };
      Evento.findById.mockResolvedValue(mockEvento);

      // Act
      await changeEventStatus(req, res);

      // Assert
      expect(Evento.findById).toHaveBeenCalledWith('evento_id_123');
      expect(mockEvento.activo).toBe(false); // Verifica que el estado se actualizó
      expect(mockEvento.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Estado del evento actualizado exitosamente.',
          evento: expect.objectContaining({
            _id: 'evento_id_123',
            activo: false
          })
        })
      );
    });

    test('❌ Debe retornar 404 si el evento no se encuentra', async () => {
      // Arrange
      req.params = { id: 'non_existent_id' };
      req.body = { activo: false };
      Evento.findById.mockResolvedValue(null);

      // Act
      await changeEventStatus(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Evento no encontrado.'
        })
      );
    });

    test('❌ Debe retornar 403 si el usuario no es el dueño de la ONG del evento', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      req.body = { activo: false };
      const mockEvento = {
        _id: 'evento_id_123',
        ongId: 999, // ONG diferente
        activo: true,
        save: jest.fn().mockResolvedValue(true)
      };
      Evento.findById.mockResolvedValue(mockEvento);

      // Act
      await changeEventStatus(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Acceso denegado. No eres el dueño de esta ONG.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor al cambiar el estado', async () => {
      // Arrange
      req.params = { id: 'evento_id_123' };
      req.body = { activo: false };
      Evento.findById.mockRejectedValue(new Error('Error de DB'));

      // Act
      await changeEventStatus(req, res);

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

  describe('getEventStatistics', () => {
    test('✅ Debe obtener estadísticas del evento', async () => {
      // Arrange
      req.params = { eventoId: 'evento_id_123' };
      // req.query = { ongId: 1 }; // Esto ya debería venir de req.user

      const mockEvento = {
        _id: 'evento_id_123',
        titulo: 'Evento Test',
        ongId: req.user.ongId, // Asegúrate de que coincida con el ongId del usuario mockeado
        activo: true,
        participantes: [
          { userId: 'p1', tipoParticipante: 'participante' },
          { userId: 'v1', tipoParticipante: 'voluntario' },
          { userId: 'p2', tipoParticipante: 'participante' }
        ],
        metricas: {
          totalInscritos: 3,
          totalAsistentes: 2, // Asumiendo que se puede calcular o es un campo en el modelo
          porcentajeAsistencia: 66.67
        },
        imagenesPromocionales: [{ tipo: 'galeria' }],
        empresasPatrocinadoras: [1, 2],
        empresasAuspiciadoras: [3]
      };

      Evento.findById.mockResolvedValue(mockEvento);

      // Act
      await getEventStatistics(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          estadisticas: expect.objectContaining({
            evento: expect.objectContaining({
              titulo: 'Evento Test'
            }),
            participacion: expect.objectContaining({
              totalInscritos: 3,
              totalAsistentes: 2,
              porcentajeAsistencia: 66.67
            }),
            patrocinio: expect.objectContaining({
              totalPatrocinadores: 2,
              totalAuspiciadores: 1
            })
          })
        })
      );
    });

    test('❌ Debe fallar si el evento no se encuentra', async () => {
      // Arrange
      req.params = { eventoId: 'non_existent_id' };
      Evento.findById.mockResolvedValue(null);

      // Act
      await getEventStatistics(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Evento no encontrado.'
        })
      );
    });

    test('❌ Debe fallar si no es el dueño de la ONG del evento', async () => {
      // Arrange
      req.params = { eventoId: 'evento_id_123' };
      // Cambiamos el ongId del usuario mockeado en este test específico para simular falta de autorización
      req.user = { userId: 99, ongId: 99, tipo_usuario: 'ONG' }; // Una ONG diferente

      const mockEvento = {
        ongId: 1, // ONG original del evento
        activo: true
      };

      Evento.findById.mockResolvedValue(mockEvento);

      // Act
      await getEventStatistics(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Acceso denegado. No eres el dueño de esta ONG.'
        })
      );
    });
  });
});