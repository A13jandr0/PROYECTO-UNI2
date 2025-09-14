const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Tu middleware de autenticación actual (MANTENER)
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token de acceso requerido'
            });
        }

        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user || !user.activo) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido o usuario inactivo'
            });
        }

        const activeSession = user.sesiones.find(session => 
            session.token.startsWith(token.substring(0, 20)) && session.activa
        );

        if (!activeSession) {
            return res.status(401).json({
                success: false,
                error: 'Sesión expirada'
            });
        }

        req.user = {
            userId: user._id,
            sqlUserId: user.sqlUserId,  // ← IMPORTANTE para mega eventos
            email: user.correo,
            tipo_usuario: user.tipo_usuario,
            nombre_usuario: user.nombre_usuario
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Token inválido'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expirado'
            });
        }

        console.error('Error en middleware de autenticación:', error);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
};

// Middleware para verificar roles específicos (usando TU sistema)
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        if (!roles.includes(req.user.tipo_usuario)) {
            return res.status(403).json({
                success: false,
                error: 'No tienes permisos para acceder a este recurso'
            });
        }

        next();
    };
};

// Middlewares específicos para mega eventos
const requireONG = requireRole(['ONG']);
const requireEmpresa = requireRole(['Empresa']);
const requireIntegranteExterno = requireRole(['Integrante externo']);
const requireSuperAdmin = requireRole(['Super admin']);

// Middleware para verificar propietario de mega evento
const requireMegaEventOwner = async (req, res, next) => {
    try {
        const { megaEventoId } = req.params;
        
        if (!req.user || !req.user.sqlUserId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        const MegaEvento = require('../models/MegaEvento.model');
        const megaEvento = await MegaEvento.findById(megaEventoId);

        if (!megaEvento) {
            return res.status(404).json({
                success: false,
                error: 'Mega evento no encontrado'
            });
        }

        // Verificar que el usuario sea la ONG organizadora principal
        if (megaEvento.ongOrganizadoraPrincipal !== req.user.sqlUserId) {
            return res.status(403).json({
                success: false,
                error: 'No autorizado para modificar este mega evento'
            });
        }

        // Agregar el mega evento al request para evitar otra consulta
        req.megaEvento = megaEvento;
        next();
    } catch (error) {
        console.error('Error en middleware requireMegaEventOwner:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno de autorización'
        });
    }
};

// Middleware para verificar propietario de evento regular
const requireEventOwner = async (req, res, next) => {
    try {
        const { eventoId } = req.params;
        
        if (!req.user || !req.user.sqlUserId) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no autenticado'
            });
        }

        const Evento = require('../models/evento.model');
        const evento = await Evento.findById(eventoId);

        if (!evento || !evento.activo) {
            return res.status(404).json({
                success: false,
                error: 'Evento no encontrado'
            });
        }

        if (evento.ongId !== req.user.sqlUserId) {
            return res.status(403).json({
                success: false,
                error: 'No autorizado para modificar este evento'
            });
        }

        req.evento = evento;
        next();
    } catch (error) {
        console.error('Error en middleware requireEventOwner:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno de autorización'
        });
    }
};

// Middleware para validar parámetros
const validateParams = (requiredParams) => {
    return (req, res, next) => {
        const missingParams = [];

        for (const param of requiredParams) {
            if (!req.params[param] && !req.body[param] && !req.query[param]) {
                missingParams.push(param);
            }
        }

        if (missingParams.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Parámetros faltantes: ${missingParams.join(', ')}`
            });
        }

        next();
    };
};

// Middleware para logging de actividades
const logActivity = (activity) => {
    return (req, res, next) => {
        const timestamp = new Date().toISOString();
        const userId = req.user ? req.user.sqlUserId : 'anonymous';
        const userType = req.user ? req.user.tipo_usuario : 'unknown';
        const ip = req.ip || req.connection.remoteAddress;

        console.log(`📝 [${timestamp}] ${activity} - Usuario: ${userId} (${userType}) - IP: ${ip}`);
        next();
    };
};

// Middleware para verificar que la empresa pertenece al usuario autenticado
const validateOwnCompany = (req, res, next) => {
    const { empresaId } = req.params;
    const { empresaId: bodyEmpresaId } = req.body;
    
    const targetEmpresaId = empresaId || bodyEmpresaId;
    
    if (req.user.tipo_usuario === 'Empresa' && parseInt(targetEmpresaId) !== req.user.sqlUserId) {
        return res.status(403).json({
            success: false,
            error: 'Solo puedes realizar acciones en nombre de tu propia empresa'
        });
    }
    
    next();
};

// Middleware para verificar que la ONG pertenece al usuario autenticado
const validateOwnONG = (req, res, next) => {
  const { ongId: paramOngId } = req.params;
  // si no hay cuerpo, usamos un objeto vacío
  const { ongId: bodyOngId, ongOrganizadoraPrincipal } = req.body || {};

  // priorizamos el param (en GET), si no existe usamos bodyOngId u ongOrganizadoraPrincipal
  const targetOngId = paramOngId || bodyOngId || ongOrganizadoraPrincipal;

  if (req.user.tipo_usuario === 'ONG' && parseInt(targetOngId) !== req.user.sqlUserId) {
    return res.status(403).json({
      success: false,
      error: 'Solo puedes realizar acciones en nombre de tu propia ONG'
    });
  }

  next();
};


// Middleware para verificar que el integrante pertenece al usuario autenticado
const validateOwnIntegrante = (req, res, next) => {
    const { integranteId } = req.params;
    const { integranteId: bodyIntegranteId } = req.body;
    
    const targetIntegranteId = integranteId || bodyIntegranteId;
    
    if (req.user.tipo_usuario === 'Integrante externo' && parseInt(targetIntegranteId) !== req.user.sqlUserId) {
        return res.status(403).json({
            success: false,
            error: 'Solo puedes realizar acciones en tu propio nombre'
        });
    }
    
    next();
};

module.exports = {
   
    authenticateToken,
    requireRole,
    requireSuperAdmin,
    requireEmpresa,
    requireONG,
    requireIntegranteExterno,
    requireMegaEventOwner,
    requireEventOwner,
    validateParams,
    logActivity,
    validateOwnCompany,
    validateOwnONG,
    validateOwnIntegrante
};