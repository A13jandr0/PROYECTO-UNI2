const { body, param, query, validationResult } = require('express-validator');
const validator = require('validator');

// =================== HELPER FUNCTIONS ===================

// Función para manejar errores de validación
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Errores de validación',
      details: errors.array().map(error => ({
        campo: error.path,
        valor: error.value,
        mensaje: error.msg,
        ubicacion: error.location
      }))
    });
  }
  next();
};

// Estados válidos para mega eventos
const ESTADOS_MEGA_EVENTO = ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado'];
const CATEGORIAS_MEGA_EVENTO = ['social', 'ambiental', 'educativo', 'salud', 'cultural', 'deportivo', 'tecnologico', 'otro'];
const TIPOS_LOCACION = ['presencial', 'virtual', 'hibrido'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
const TIPOS_PARTICIPACION = ['participante', 'voluntario', 'ponente', 'facilitador', 'invitado_especial'];
const TIPOS_PATROCINIO = ['patrocinador', 'auspiciador', 'colaborador', 'benefactor'];
const ROLES_ORGANIZACION = ['coordinador_principal', 'co_organizador', 'colaborador', 'apoyo'];

// Sanitizar entrada de texto
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str === 'string') {
      return validator.escape(str.trim());
    }
    return str;
  };

  // Campos a sanitizar
  const fieldsToSanitize = [
    'titulo', 'descripcion', 'ubicacion', 'categoria', 
    'tags', 'objetivos', 'resultadosEsperados', 'motivo',
    'observaciones', 'comentarios'
  ];

  fieldsToSanitize.forEach(field => {
    if (req.body[field]) {
      if (Array.isArray(req.body[field])) {
        req.body[field] = req.body[field].map(item => sanitizeString(item));
      } else {
        req.body[field] = sanitizeString(req.body[field]);
      }
    }
  });

  next();
};

// =================== VALIDACIONES PRINCIPALES ===================

// 1. VALIDACIÓN PARA CREAR/ACTUALIZAR MEGA EVENTO
const validateMegaEvent = [
  // Sanitizar primero
  sanitizeInput,

  // Título
  body('titulo')
    .notEmpty()
    .withMessage('El título es requerido')
    .isLength({ min: 5, max: 200 })
    .withMessage('El título debe tener entre 5 y 200 caracteres')
    .trim()
    .matches(/^[a-zA-Z0-9\s\-_.,!?()áéíóúñÁÉÍÓÚÑ]+$/)
    .withMessage('El título contiene caracteres no permitidos'),

  // Descripción
  body('descripcion')
    .optional()
    .isLength({ max: 5000 })
    .withMessage('La descripción no puede exceder 5000 caracteres')
    .trim(),

  // Fechas
  body('fechaInicio')
    .notEmpty()
    .withMessage('La fecha de inicio es requerida')
    .isISO8601()
    .withMessage('La fecha de inicio debe tener formato válido (ISO 8601)')
    .custom((value) => {
      const fecha = new Date(value);
      const ahora = new Date();
      const unDiaAtras = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
      
      if (fecha < unDiaAtras) {
        throw new Error('La fecha de inicio no puede ser más de 1 día en el pasado');
      }

      const unAñoAdelante = new Date(ahora.getTime() + 365 * 24 * 60 * 60 * 1000);
      if (fecha > unAñoAdelante) {
        throw new Error('La fecha de inicio no puede ser más de 1 año en el futuro');
      }
      
      return true;
    }),

  body('fechaFin')
    .notEmpty()
    .withMessage('La fecha de fin es requerida')
    .isISO8601()
    .withMessage('La fecha de fin debe tener formato válido (ISO 8601)')
    .custom((value, { req }) => {
      const fechaFin = new Date(value);
      const fechaInicio = new Date(req.body.fechaInicio);
      
      if (fechaFin <= fechaInicio) {
        throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
      }
      
      const diferenciaDias = (fechaFin - fechaInicio) / (1000 * 60 * 60 * 24);
      if (diferenciaDias > 30) {
        throw new Error('La duración del mega evento no puede exceder 30 días');
      }

      if (diferenciaDias < 1) {
        throw new Error('El mega evento debe durar al menos 1 día');
      }
      
      return true;
    }),

  // Fecha límite de inscripción (opcional)
  body('fechaLimiteInscripcion')
    .optional()
    .isISO8601()
    .withMessage('La fecha límite de inscripción debe tener formato válido')
    .custom((value, { req }) => {
      if (value) {
        const fechaLimite = new Date(value);
        const fechaInicio = new Date(req.body.fechaInicio);
        
        if (fechaLimite >= fechaInicio) {
          throw new Error('La fecha límite de inscripción debe ser anterior a la fecha de inicio');
        }

        const ahora = new Date();
        if (fechaLimite < ahora) {
          throw new Error('La fecha límite de inscripción no puede estar en el pasado');
        }
      }
      return true;
    }),

  // Ubicación
  body('ubicacion')
    .notEmpty()
    .withMessage('La ubicación es requerida')
    .custom((value) => {
      if (typeof value === 'string') {
        if (value.trim().length < 10) {
          throw new Error('La dirección debe tener al menos 10 caracteres');
        }
      } else if (typeof value === 'object') {
        if (!value.direccion || value.direccion.trim().length < 10) {
          throw new Error('La dirección en el objeto ubicación es requerida y debe tener al menos 10 caracteres');
        }
        if (value.tipoLocacion && !TIPOS_LOCACION.includes(value.tipoLocacion)) {
          throw new Error(`Tipo de locación debe ser uno de: ${TIPOS_LOCACION.join(', ')}`);
        }
        if (value.tipoLocacion === 'virtual' && !value.enlaceVirtual) {
          throw new Error('Se requiere enlace virtual para eventos virtuales');
        }
        if (value.coordenadas) {
          if (typeof value.coordenadas.latitud !== 'number' || typeof value.coordenadas.longitud !== 'number') {
            throw new Error('Las coordenadas deben ser números válidos');
          }
          if (Math.abs(value.coordenadas.latitud) > 90 || Math.abs(value.coordenadas.longitud) > 180) {
            throw new Error('Coordenadas geográficas inválidas');
          }
        }
      } else {
        throw new Error('La ubicación debe ser un string o un objeto válido');
      }
      return true;
    }),

  // Categoría
  body('categoria')
    .optional()
    .isIn(CATEGORIAS_MEGA_EVENTO)
    .withMessage(`La categoría debe ser una de: ${CATEGORIAS_MEGA_EVENTO.join(', ')}`),

  // ONG organizadora principal
  body('ongOrganizadoraPrincipal')
    .notEmpty()
    .withMessage('La ONG organizadora principal es requerida')
    .isInt({ min: 1 })
    .withMessage('El ID de la ONG organizadora debe ser un número entero positivo')
    .toInt(),

  // Capacidad máxima
  body('capacidadMaxima')
    .optional()
    .isInt({ min: 50, max: 50000 })
    .withMessage('La capacidad máxima debe ser un número entre 50 y 50,000')
    .toInt(),

  // Estado
  body('estado')
    .optional()
    .isIn(ESTADOS_MEGA_EVENTO)
    .withMessage(`El estado debe ser uno de: ${ESTADOS_MEGA_EVENTO.join(', ')}`),

  // Prioridad
  body('prioridad')
    .optional()
    .isIn(PRIORIDADES)
    .withMessage(`La prioridad debe ser una de: ${PRIORIDADES.join(', ')}`),

  // Campos booleanos
  body('requiereAprobacion')
    .optional()
    .isBoolean()
    .withMessage('RequiereAprobacion debe ser true o false')
    .toBoolean(),

  body('esPublico')
    .optional()
    .isBoolean()
    .withMessage('EsPublico debe ser true o false')
    .toBoolean(),

  body('certificacionDisponible')
    .optional()
    .isBoolean()
    .withMessage('CertificacionDisponible debe ser true o false')
    .toBoolean(),

  body('inscripcionAbierta')
    .optional()
    .isBoolean()
    .withMessage('InscripcionAbierta debe ser true o false')
    .toBoolean(),

  // Arrays
  body('tags')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          throw new Error('Tags debe ser un array válido o JSON string');
        }
      }
      if (!Array.isArray(value)) {
        throw new Error('Tags debe ser un array');
      }
      if (value.length > 10) {
        throw new Error('Máximo 10 tags permitidos');
      }
      value.forEach(tag => {
        if (typeof tag !== 'string' || tag.trim().length < 2) {
          throw new Error('Cada tag debe ser un string de al menos 2 caracteres');
        }
        if (tag.length > 30) {
          throw new Error('Cada tag no puede exceder 30 caracteres');
        }
      });
      return true;
    }),

  body('objetivos')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          throw new Error('Objetivos debe ser un array válido o JSON string');
        }
      }
      if (!Array.isArray(value)) {
        throw new Error('Objetivos debe ser un array');
      }
      if (value.length > 10) {
        throw new Error('Máximo 10 objetivos permitidos');
      }
      value.forEach(objetivo => {
        if (typeof objetivo !== 'string' || objetivo.trim().length < 10) {
          throw new Error('Cada objetivo debe ser un string de al menos 10 caracteres');
        }
        if (objetivo.length > 200) {
          throw new Error('Cada objetivo no puede exceder 200 caracteres');
        }
      });
      return true;
    }),

  body('resultadosEsperados')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          throw new Error('ResultadosEsperados debe ser un array válido o JSON string');
        }
      }
      if (!Array.isArray(value)) {
        throw new Error('ResultadosEsperados debe ser un array');
      }
      if (value.length > 10) {
        throw new Error('Máximo 10 resultados esperados permitidos');
      }
      value.forEach(resultado => {
        if (typeof resultado !== 'string' || resultado.trim().length < 10) {
          throw new Error('Cada resultado esperado debe ser un string de al menos 10 caracteres');
        }
        if (resultado.length > 200) {
          throw new Error('Cada resultado esperado no puede exceder 200 caracteres');
        }
      });
      return true;
    }),

  // Información de contacto
  body('contactoInfo.emailPrincipal')
    .optional()
    .isEmail()
    .withMessage('Email principal debe ser un email válido')
    .normalizeEmail(),

  body('contactoInfo.telefonoPrincipal')
    .optional()
    .isMobilePhone('any')
    .withMessage('Teléfono principal debe ser un número válido'),

  body('contactoInfo.sitioWeb')
    .optional()
    .isURL()
    .withMessage('Sitio web debe ser una URL válida'),

  handleValidationErrors
];

// 2. VALIDACIÓN PARA PARTICIPANTE EXTERNO
const validateExternalParticipant = [
  param('megaEventoId')
    .isMongoId()
    .withMessage('ID de mega evento inválido'),
  
  body('integranteId')
    .notEmpty()
    .withMessage('El ID de integrante es requerido')
    .isInt({ min: 1 })
    .withMessage('ID de integrante debe ser un número entero positivo')
    .toInt(),
  
  body('tipoParticipacion')
    .notEmpty()
    .withMessage('El tipo de participación es requerido')
    .isIn(TIPOS_PARTICIPACION)
    .withMessage(`Tipo de participación debe ser uno de: ${TIPOS_PARTICIPACION.join(', ')}`),

  body('habilidadesOfrecidas')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          throw new Error('HabilidadesOfrecidas debe ser un array válido o JSON string');
        }
      }
      if (!Array.isArray(value)) {
        throw new Error('HabilidadesOfrecidas debe ser un array');
      }
      if (value.length > 10) {
        throw new Error('Máximo 10 habilidades permitidas');
      }
      value.forEach(habilidad => {
        if (typeof habilidad !== 'string' || habilidad.trim().length < 3) {
          throw new Error('Cada habilidad debe ser un string de al menos 3 caracteres');
        }
        if (habilidad.length > 50) {
          throw new Error('Cada habilidad no puede exceder 50 caracteres');
        }
      });
      return true;
    }),

  body('disponibilidad')
    .optional()
    .isIn(['completa', 'parcial', 'horarios_especificos'])
    .withMessage('La disponibilidad debe ser: completa, parcial o horarios_especificos'),

  body('comentarios')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Los comentarios no pueden exceder 1000 caracteres')
    .trim(),

  handleValidationErrors
];

// 3. VALIDACIÓN PARA PATROCINIO DE EMPRESA
const validateCompanySponsorship = [
  param('megaEventoId')
    .isMongoId()
    .withMessage('ID de mega evento inválido'),
  
  body('empresaId')
    .notEmpty()
    .withMessage('El ID de empresa es requerido')
    .isInt({ min: 1 })
    .withMessage('ID de empresa debe ser un número entero positivo')
    .toInt(),
  
  body('tipoPatrocinio')
    .notEmpty()
    .withMessage('El tipo de patrocinio es requerido')
    .isIn(TIPOS_PATROCINIO)
    .withMessage(`Tipo de patrocinio debe ser uno de: ${TIPOS_PATROCINIO.join(', ')}`),
  
  body('montoContribucion')
    .optional()
    .isFloat({ min: 0, max: 10000000 })
    .withMessage('El monto de contribución debe ser un número positivo menor a 10,000,000')
    .toFloat(),

  body('descripcionContribucion')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La descripción de contribución no puede exceder 1000 caracteres')
    .trim(),

  body('nivelVisibilidad')
    .optional()
    .isIn(['alto', 'medio', 'bajo'])
    .withMessage('El nivel de visibilidad debe ser: alto, medio o bajo'),

  body('beneficiosEsperados')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          throw new Error('BeneficiosEsperados debe ser un array válido o JSON string');
        }
      }
      if (!Array.isArray(value)) {
        throw new Error('BeneficiosEsperados debe ser un array');
      }
      if (value.length > 5) {
        throw new Error('Máximo 5 beneficios esperados permitidos');
      }
      return true;
    }),

  handleValidationErrors
];

// 4. VALIDACIÓN PARA CAMBIO DE ESTADO
const validateStatusChange = [
  body('nuevoEstado')
    .notEmpty()
    .withMessage('El nuevo estado es requerido')
    .isIn(ESTADOS_MEGA_EVENTO)
    .withMessage(`El estado debe ser uno de: ${ESTADOS_MEGA_EVENTO.join(', ')}`),

  body('ongId')
    .notEmpty()
    .withMessage('El ID de la ONG es requerido')
    .isInt({ min: 1 })
    .withMessage('El ID de la ONG debe ser un número entero positivo')
    .toInt(),

  body('motivo')
    .optional()
    .isLength({ min: 5, max: 500 })
    .withMessage('El motivo debe tener entre 5 y 500 caracteres')
    .trim(),

  body('observaciones')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Las observaciones no pueden exceder 1000 caracteres')
    .trim(),

  body('fechaEfectiva')
    .optional()
    .isISO8601()
    .withMessage('La fecha efectiva debe tener formato válido')
    .custom((value) => {
      if (value) {
        const fecha = new Date(value);
        const ahora = new Date();
        const unDiaAtras = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
        const unMesAdelante = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        if (fecha < unDiaAtras) {
          throw new Error('La fecha efectiva no puede ser más de 1 día en el pasado');
        }
        if (fecha > unMesAdelante) {
          throw new Error('La fecha efectiva no puede ser más de 1 mes en el futuro');
        }
      }
      return true;
    }),

  handleValidationErrors
];

// 5. VALIDACIÓN PARA PAGINACIÓN
const validatePagination = [
  query('pagina')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('La página debe ser un número entero entre 1 y 1000')
    .toInt(),
  
  query('limite')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El límite debe estar entre 1 y 100')
    .toInt(),

  query('ordenar')
    .optional()
    .isIn(['reciente', 'antiguo', 'titulo', 'fecha_inicio', 'popularidad', 'capacidad'])
    .withMessage('Ordenamiento inválido'),

  query('direccion')
    .optional()
    .isIn(['asc', 'desc', 'ascendente', 'descendente'])
    .withMessage('Dirección de ordenamiento inválida'),
  
  handleValidationErrors
];

// 6. VALIDACIÓN PARA MONGO ID
const validateMongoId = (paramName) => [
  param(paramName)
    .notEmpty()
    .withMessage(`${paramName} es requerido`)
    .isMongoId()
    .withMessage(`${paramName} debe ser un ID de MongoDB válido`)
    .isLength({ min: 24, max: 24 })
    .withMessage(`${paramName} debe tener exactamente 24 caracteres`),
  
  handleValidationErrors
];

// =================== VALIDACIONES ADICIONALES ===================

// Validación para agregar ONG colaboradora
const validateCollaboratingONG = [
  param('megaEventoId')
    .isMongoId()
    .withMessage('ID de mega evento inválido'),

  body('ongColaboradoraId')
    .notEmpty()
    .withMessage('El ID de la ONG colaboradora es requerido')
    .isInt({ min: 1 })
    .withMessage('ID de ONG debe ser un número entero positivo')
    .toInt(),

  body('rolOrganizacion')
    .optional()
    .isIn(ROLES_ORGANIZACION)
    .withMessage(`El rol de organización debe ser uno de: ${ROLES_ORGANIZACION.join(', ')}`),

  body('responsabilidades')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          throw new Error('Responsabilidades debe ser un array válido o JSON string');
        }
      }
      if (!Array.isArray(value)) {
        throw new Error('Responsabilidades debe ser un array');
      }
      if (value.length > 10) {
        throw new Error('Máximo 10 responsabilidades permitidas');
      }
      return true;
    }),

  handleValidationErrors
];

// Validación para registrar asistencia masiva
const validateMassAttendance = [
  param('megaEventoId')
    .isMongoId()
    .withMessage('ID de mega evento inválido'),

  body('asistencias')
    .notEmpty()
    .withMessage('Array de asistencias es requerido')
    .isArray({ min: 1, max: 1000 })
    .withMessage('Debe proporcionar entre 1 y 1000 registros de asistencia'),

  body('asistencias.*.integranteId')
    .isInt({ min: 1 })
    .withMessage('ID de integrante debe ser un número entero positivo')
    .toInt(),

  body('asistencias.*.asistencia')
    .isBoolean()
    .withMessage('Asistencia debe ser true o false')
    .toBoolean(),

  body('asistencias.*.comentarios')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Comentarios no pueden exceder 200 caracteres'),

  handleValidationErrors
];

// Validación para generar certificados masivos
const validateMassCertificates = [
  param('megaEventoId')
    .isMongoId()
    .withMessage('ID de mega evento inválido'),

  body('participantesIds')
    .optional()
    .isArray({ max: 1000 })
    .withMessage('Máximo 1000 participantes para certificación masiva'),

  body('participantesIds.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('ID de participante debe ser un número entero positivo')
    .toInt(),

  body('tiposCertificado')
    .optional()
    .custom((value) => {
      if (!Array.isArray(value)) {
        throw new Error('TiposCertificado debe ser un array');
      }
      const tiposValidos = ['participacion', 'asistencia', 'voluntariado', 'ponencia', 'organizacion'];
      value.forEach(tipo => {
        if (!tiposValidos.includes(tipo)) {
          throw new Error(`Tipo de certificado inválido: ${tipo}`);
        }
      });
      return true;
    }),

  handleValidationErrors
];

// Validación para filtros de búsqueda
const validateSearchFilters = [
  query('termino')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('El término de búsqueda debe tener entre 2 y 100 caracteres')
    .trim(),

  query('categoria')
    .optional()
    .isIn(CATEGORIAS_MEGA_EVENTO)
    .withMessage(`Categoría debe ser una de: ${CATEGORIAS_MEGA_EVENTO.join(', ')}`),

  query('ciudad')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Ciudad debe tener entre 2 y 50 caracteres')
    .trim(),

  query('fechaDesde')
    .optional()
    .isISO8601()
    .withMessage('FechaDesde debe ser una fecha válida'),

  query('fechaHasta')
    .optional()
    .isISO8601()
    .withMessage('FechaHasta debe ser una fecha válida')
    .custom((value, { req }) => {
      if (value && req.query.fechaDesde) {
        const fechaHasta = new Date(value);
        const fechaDesde = new Date(req.query.fechaDesde);
        if (fechaHasta <= fechaDesde) {
          throw new Error('FechaHasta debe ser posterior a FechaDesde');
        }
      }
      return true;
    }),

  query('estado')
    .optional()
    .isIn([...ESTADOS_MEGA_EVENTO, 'todos'])
    .withMessage(`Estado debe ser uno de: ${[...ESTADOS_MEGA_EVENTO, 'todos'].join(', ')}`),

  query('capacidadMin')
    .optional()
    .isInt({ min: 1 })
    .withMessage('CapacidadMin debe ser un número entero positivo')
    .toInt(),

  query('capacidadMax')
    .optional()
    .isInt({ min: 1 })
    .withMessage('CapacidadMax debe ser un número entero positivo')
    .toInt(),

  handleValidationErrors
];

// =================== EXPORTS ===================

module.exports = {
  // Validaciones principales
  validateMegaEvent,
  validateExternalParticipant,
  validateCompanySponsorship,
  validateStatusChange,
  validatePagination,
  validateMongoId,
  
  // Validaciones adicionales
  validateCollaboratingONG,
  validateMassAttendance,
  validateMassCertificates,
  validateSearchFilters,
  
  // Helpers
  handleValidationErrors,
  sanitizeInput,
  
  // Constantes para referencia
  ESTADOS_MEGA_EVENTO,
  CATEGORIAS_MEGA_EVENTO,
  TIPOS_LOCACION,
  PRIORIDADES,
  TIPOS_PARTICIPACION,
  TIPOS_PATROCINIO,
  ROLES_ORGANIZACION
};