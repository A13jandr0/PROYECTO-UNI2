// tests/controllers/auth.test.js
const {
  registerUser,
  login,
  logout,
  getProfile,
  forgotPasswordSimple,
  resetPasswordSimple
} = require('../../controllers/auth.controller'); // Ya corregido en el código que subiste

const {
  createMockRequest,
  createMockResponse,
  createMockUserData
} = require('../helpers/testHelpers');

// Mock de dependencias
jest.mock('../../config/db', () => require('../mocks/db.mock'));
jest.mock('../../models/user'); 
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

const User = require('../../models/user'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { poolPromise } = require('../../config/db');

describe('🔐 Controlador de Autenticación', () => {
  let req, res, mockPool;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    jest.clearAllMocks();

    // Setup mock pool
    mockPool = {
      transaction: jest.fn().mockReturnValue({
        begin: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        request: jest.fn().mockReturnValue({
          input: jest.fn().mockReturnThis(),
          query: jest.fn().mockResolvedValue({
            recordset: [{ UserID: 1 }] // Ajustado para reflejar UserID
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
  });

  describe('registerUser', () => {
    test('✅ Debe registrar un nuevo usuario exitosamente', async () => {
      // Arrange
      req.body = createMockUserData();

      User.findOne.mockResolvedValue(null); // No existe usuario con ese email/nombre
      bcrypt.hash.mockResolvedValue('hashedpassword123'); // Contraseña hasheada

      const mockUser = {
        _id: 'user_id_123',
        email: req.body.email,
        nombre_usuario: req.body.nombre_usuario,
        save: jest.fn().mockResolvedValue(true) // Simula el guardado exitoso
      };
      User.mockImplementation(() => mockUser); // Cuando se crea una nueva instancia de User

      // Act
      await registerUser(req, res);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: req.body.email });
      expect(bcrypt.hash).toHaveBeenCalledWith(req.body.contrasena, 10);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockPool.transaction().request().input).toHaveBeenCalledWith('nombre_usuario', expect.any(String), req.body.nombre_usuario);
      expect(mockPool.transaction().request().input).toHaveBeenCalledWith('tipo_usuario', expect.any(String), req.body.tipo_usuario);
      expect(mockPool.transaction().request().query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO Usuarios (nombre_usuario, email, tipo_usuario, hash_contrasena)'));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Usuario registrado exitosamente.',
          user: expect.objectContaining({
            email: req.body.email
          })
        })
      );
    });

    test('❌ Debe fallar si el usuario ya existe', async () => {
      // Arrange
      req.body = createMockUserData();
      User.findOne.mockResolvedValue({ email: req.body.email }); // Simula que el usuario ya existe

      // Act
      await registerUser(req, res);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: req.body.email });
      expect(res.status).toHaveBeenCalledWith(409); // Conflict
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'El email ya está registrado.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor durante el registro', async () => {
      // Arrange
      req.body = createMockUserData();
      User.findOne.mockResolvedValue(null);
      bcrypt.hash.mockRejectedValue(new Error('Error al hashear contraseña')); // Simula un error al hashear

      // Act
      await registerUser(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500); // Internal Server Error
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Error interno del servidor.'
        })
      );
    });
  });

  describe('login', () => {
    test('✅ Debe iniciar sesión exitosamente con credenciales válidas', async () => {
      // Arrange
      const userData = createMockUserData();
      req.body = {
        email: userData.email,
        contrasena: userData.contrasena
      };

      const mockUser = {
        _id: 'user_id_123',
        email: userData.email,
        nombre_usuario: userData.nombre_usuario,
        hash_contrasena: 'hashedpassword123',
        tipo_usuario: 'ONG',
        ongId: 1 // Asegúrate de que el mockUser tenga ongId si es de tipo ONG
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true); // Contraseña correcta
      jwt.sign.mockReturnValue('mocked_jwt_token');

      // Act
      await login(req, res);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: req.body.email });
      expect(bcrypt.compare).toHaveBeenCalledWith(req.body.contrasena, mockUser.hash_contrasena);
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: mockUser._id, tipo_usuario: mockUser.tipo_usuario, ongId: mockUser.ongId }, // Asegúrate de que los claims del token incluyan ongId
        process.env.JWT_SECRET, { expiresIn: '1h' }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Inicio de sesión exitoso.',
          token: 'mocked_jwt_token',
          user: expect.objectContaining({
            email: mockUser.email,
            nombre_usuario: mockUser.nombre_usuario,
            tipo_usuario: mockUser.tipo_usuario
          })
        })
      );
    });

    test('❌ Debe fallar con credenciales inválidas (email no encontrado)', async () => {
      // Arrange
      req.body = { email: 'nonexistent@test.com', contrasena: 'password123' };
      User.findOne.mockResolvedValue(null); // No se encuentra el usuario

      // Act
      await login(req, res);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: req.body.email });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Credenciales inválidas.'
        })
      );
    });

    test('❌ Debe fallar con credenciales inválidas (contraseña incorrecta)', async () => {
      // Arrange
      const userData = createMockUserData();
      req.body = { email: userData.email, contrasena: 'wrongpassword' };
      const mockUser = {
        _id: 'user_id_123',
        email: userData.email,
        hash_contrasena: 'hashedpassword123'
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false); // Contraseña incorrecta

      // Act
      await login(req, res);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: req.body.email });
      expect(bcrypt.compare).toHaveBeenCalledWith(req.body.contrasena, mockUser.hash_contrasena);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Credenciales inválidas.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor durante el login', async () => {
      // Arrange
      req.body = { email: 'test@test.com', contrasena: 'password123' };
      User.findOne.mockRejectedValue(new Error('Error de base de datos'));

      // Act
      await login(req, res);

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

  describe('getProfile', () => {
    test('✅ Debe obtener el perfil del usuario exitosamente', async () => {
      // Arrange
      const userId = 'user_id_123';
      const mockUser = {
        _id: userId,
        email: 'test@test.com',
        nombre_usuario: 'TestUser',
        tipo_usuario: 'ONG',
        ongId: 1
      };
      // Aquí simulamos que el middleware de autenticación ya añadió req.user
      req.user = { userId: userId };
      User.findById.mockResolvedValue(mockUser);

      // Act
      await getProfile(req, res);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({
            email: mockUser.email,
            nombre_usuario: mockUser.nombre_usuario,
            tipo_usuario: mockUser.tipo_usuario
          })
        })
      );
    });

    test('❌ Debe retornar 404 si el perfil no se encuentra', async () => {
      // Arrange
      const userId = 'non_existent_id';
      req.user = { userId: userId };
      User.findById.mockResolvedValue(null);

      // Act
      await getProfile(req, res);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Perfil de usuario no encontrado.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor al obtener el perfil', async () => {
      // Arrange
      const userId = 'user_id_123';
      req.user = { userId: userId };
      User.findById.mockRejectedValue(new Error('Error de base de datos'));

      // Act
      await getProfile(req, res);

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

  describe('forgotPasswordSimple', () => {
    test('✅ Debe enviar email de recuperación de contraseña exitosamente', async () => {
      // Arrange
      req.body = { email: 'test@test.com' };
      const mockUser = {
        _id: 'user_id_123',
        email: req.body.email,
        generateResetToken: jest.fn().mockResolvedValue('reset_token_123'),
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);
      // Aquí mockeamos cualquier servicio de email que uses
      jest.mock('../../../utils/sendEmail', () => jest.fn().mockResolvedValue(true)); // Asumiendo que sendEmail es una utilidad
      const sendEmail = require('../../../utils/sendEmail');

      // Act
      await forgotPasswordSimple(req, res);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: req.body.email });
      expect(mockUser.generateResetToken).toHaveBeenCalled();
      expect(mockUser.save).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalled(); // Verifica que el email fue enviado
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Instrucciones para restablecer contraseña enviadas a tu email.'
        })
      );
    });

    test('❌ Debe fallar si el email no está registrado', async () => {
      // Arrange
      req.body = { email: 'nonexistent@test.com' };
      User.findOne.mockResolvedValue(null);

      // Act
      await forgotPasswordSimple(req, res);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({ email: req.body.email });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Email no registrado.'
        })
      );
    });

    test('❌ Debe manejar errores del servidor al enviar el email de recuperación', async () => {
      // Arrange
      req.body = { email: 'test@test.com' };
      User.findOne.mockRejectedValue(new Error('Error de DB al buscar usuario'));

      // Act
      await forgotPasswordSimple(req, res);

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

  describe('resetPasswordSimple', () => {
    test('✅ Debe restablecer la contraseña exitosamente', async () => {
      // Arrange
      const resetToken = 'valid_reset_token';
      req.params = { token: resetToken };
      req.body = {
        nuevaContrasena: 'newpassword123',
        confirmarContrasena: 'newpassword123'
      };

      const mockUser = {
        _id: 'user_id_123',
        email: 'test@test.com',
        resetPasswordToken: resetToken,
        resetPasswordExpire: Date.now() + 3600000, // Válido por 1 hora
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.hash.mockResolvedValue('hashednewpassword');

      // Act
      await resetPasswordSimple(req, res);

      // Assert
      expect(User.findOne).toHaveBeenCalledWith({
        resetPasswordToken: resetToken,
        resetPasswordExpire: { $gt: Date.now() }
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(req.body.nuevaContrasena, 10);
      expect(mockUser.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Contraseña restablecida exitosamente.'
        })
      );
    });

    test('❌ Debe fallar si el token es inválido o ha expirado', async () => {
      // Arrange
      req.params = { token: 'invalid_token' };
      req.body = { nuevaContrasena: 'newpassword123', confirmarContrasena: 'newpassword123' };
      User.findOne.mockResolvedValue(null); // Token no encontrado o expirado

      // Act
      await resetPasswordSimple(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Token inválido o ha expirado.'
        })
      );
    });

    test('❌ Debe fallar si las contraseñas no coinciden', async () => {
      // Arrange
      const resetToken = 'valid_reset_token';
      req.params = { token: resetToken };
      req.body = {
        nuevaContrasena: 'newpassword123',
        confirmarContrasena: 'differentpassword'
      };

      const mockUser = {
        _id: 'user_id_123',
        email: 'test@test.com',
        resetPasswordToken: resetToken,
        resetPasswordExpire: Date.now() + 3600000, // Válido por 1 hora
        save: jest.fn().mockResolvedValue(true)
      };
      User.findOne.mockResolvedValue(mockUser);

      // Act
      await resetPasswordSimple(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Las contraseñas no coinciden'
        })
      );
    });

    test('❌ Debe fallar si la contraseña es muy corta', async () => {
      // Arrange
      const resetToken = 'valid_reset_token';
      req.params = { token: resetToken };
      req.body = {
        nuevaContrasena: '123', // Contraseña corta
        confirmarContrasena: '123'
      };

      const mockUser = {
        _id: 'user_id_123',
        email: 'test@test.com',
        resetPasswordToken: resetToken,
        resetPasswordExpire: Date.now() + 3600000, // Válido por 1 hora
        save: jest.fn().mockResolvedValue(true)
      };
      User.findOne.mockResolvedValue(mockUser);

      // Act
      await resetPasswordSimple(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'La contraseña debe tener al menos 6 caracteres'
        })
      );
    });

    test('❌ Debe fallar si el usuario no existe para el token', async () => {
      // Arrange
      req.params = { token: 'valid_token' };
      req.body = {
        nuevaContrasena: 'newpassword123',
        confirmarContrasena: 'newpassword123'
      };
      User.findOne.mockResolvedValue(null); // Simula que el usuario no se encuentra con ese token

      // Act
      await resetPasswordSimple(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Token inválido o ha expirado.' // O un mensaje más específico si tu controlador lo tiene
        })
      );
    });

    test('❌ Debe manejar errores del servidor al restablecer contraseña', async () => {
      // Arrange
      const resetToken = 'valid_reset_token';
      req.params = { token: resetToken };
      req.body = { nuevaContrasena: 'newpassword123', confirmarContrasena: 'newpassword123' };

      User.findOne.mockRejectedValue(new Error('Error de DB al buscar usuario para token'));

      // Act
      await resetPasswordSimple(req, res);

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

  describe('logout', () => {
    test('✅ Debe cerrar sesión exitosamente', async () => {
      // Arrange
      // No se necesita nada especial en req o res para un logout simple sin tokens en backend

      // Act
      await logout(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Sesión cerrada exitosamente.'
      });
      // Si usas cookies para el token, podrías añadir un expect para res.clearCookie('token');
    });

    test('❌ Debe manejar errores si el logout falla (aunque es raro en una implementación simple)', async () => {
      // Arrange
      // Simular un escenario de fallo si tu `logout` tiene alguna lógica de BD o manejo de sesión
      // En este caso, asumimos que el logout es un simple envío de respuesta, así que es difícil que "falle"
      // Si tu logout en el controlador, por ejemplo, invalida una sesión en DB, aquí simularías ese error.

      // Para este ejemplo, no se simula un fallo ya que el controlador de logout proporcionado es muy simple.
      // Si tu controlador de logout tuviera lógica más compleja, la probarías aquí.

      // Act
      await logout(req, res); // Llama la función tal cual

      // Assert
      // Esperamos que aún así se envíe un 200 si no hay lógica de fallo explícita.
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});