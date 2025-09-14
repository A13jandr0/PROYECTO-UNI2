// ================ UTILIDADES PARA EL SISTEMA SOCIAL (SOLO MONGODB) ================

/**
 * Analiza el sentimiento de un texto basado en palabras clave
 * @param {string} texto - El texto a analizar
 * @returns {string} - 'positivo', 'negativo' o 'neutral'
 */
const analizarSentimiento = (texto) => {
  if (!texto || typeof texto !== 'string') {
    return 'neutral';
  }

  const textoLower = texto.toLowerCase();
  
  const palabrasPositivas = [
    'excelente', 'genial', 'bueno', 'fantástico', 'increíble', 
    'felicitaciones', 'perfecto', 'maravilloso', 'espectacular',
    'fenomenal', 'brillante', 'extraordinario', 'magnífico',
    'impresionante', 'sobresaliente', 'excepcional',
    'amazing', 'great', 'awesome', 'wonderful', 'perfect'
  ];
  
  const palabrasNegativas = [
    'malo', 'terrible', 'horrible', 'pésimo', 'decepcionante',
    'awful', 'bad', 'worst', 'disappointing', 'disgusting',
    'asqueroso', 'repugnante', 'deplorable', 'lamentable',
    'deficiente', 'inaceptable', 'inadecuado', 'mediocre'
  ];
  
  let scorePositivo = 0;
  let scoreNegativo = 0;
  
  // Contar palabras positivas
  palabrasPositivas.forEach(palabra => {
    const regex = new RegExp(`\\b${palabra}\\b`, 'gi');
    const matches = textoLower.match(regex);
    if (matches) {
      scorePositivo += matches.length;
    }
  });
  
  // Contar palabras negativas
  palabrasNegativas.forEach(palabra => {
    const regex = new RegExp(`\\b${palabra}\\b`, 'gi');
    const matches = textoLower.match(regex);
    if (matches) {
      scoreNegativo += matches.length;
    }
  });
  
  // Determinar sentimiento final
  if (scorePositivo > scoreNegativo) {
    return 'positivo';
  } else if (scoreNegativo > scorePositivo) {
    return 'negativo';
  }
  
  return 'neutral';
};

/**
 * Valida el contenido de un comentario
 * @param {string} contenido - El contenido a validar
 * @returns {object} - { valido: boolean, error: string }
 */
const validarContenidoComentario = (contenido) => {
  if (!contenido || typeof contenido !== 'string') {
    return {
      valido: false,
      error: 'El contenido es requerido'
    };
  }
  
  const contenidoTrimmed = contenido.trim();
  
  if (contenidoTrimmed.length === 0) {
    return {
      valido: false,
      error: 'El contenido no puede estar vacío'
    };
  }
  
  if (contenidoTrimmed.length > 2000) {
    return {
      valido: false,
      error: 'El contenido no puede exceder 2000 caracteres'
    };
  }
  
  return {
    valido: true,
    error: null
  };
};

/**
 * Valida el contenido de una respuesta
 * @param {string} contenido - El contenido a validar
 * @returns {object} - { valido: boolean, error: string }
 */
const validarContenidoRespuesta = (contenido) => {
  if (!contenido || typeof contenido !== 'string') {
    return {
      valido: false,
      error: 'El contenido es requerido'
    };
  }
  
  const contenidoTrimmed = contenido.trim();
  
  if (contenidoTrimmed.length === 0) {
    return {
      valido: false,
      error: 'El contenido no puede estar vacío'
    };
  }
  
  if (contenidoTrimmed.length > 1000) {
    return {
      valido: false,
      error: 'El contenido no puede exceder 1000 caracteres'
    };
  }
  
  return {
    valido: true,
    error: null
  };
};

/**
 * Verifica si un comentario puede ser editado (dentro de 24 horas)
 * @param {Date} fechaCreacion - Fecha de creación del comentario
 * @returns {boolean} - true si puede ser editado, false si no
 */
const puedeEditarComentario = (fechaCreacion) => {
  if (!fechaCreacion) return false;
  
  const ahora = new Date();
  const tiempoTranscurrido = ahora.getTime() - fechaCreacion.getTime();
  const tiempoLimite = 24 * 60 * 60 * 1000; // 24 horas en ms
  
  return tiempoTranscurrido <= tiempoLimite;
};

/**
 * Detecta menciones en un texto (@usuario)
 * @param {string} texto - El texto donde buscar menciones
 * @returns {Array} - Array de menciones encontradas
 */
const detectarMenciones = (texto) => {
  if (!texto || typeof texto !== 'string') {
    return [];
  }
  
  const regex = /@(\w+)/g;
  const menciones = [];
  let match;
  
  while ((match = regex.exec(texto)) !== null) {
    menciones.push(match[1]);
  }
  
  return [...new Set(menciones)]; // Eliminar duplicados
};

/**
 * Detecta hashtags en un texto (#hashtag)
 * @param {string} texto - El texto donde buscar hashtags
 * @returns {Array} - Array de hashtags encontrados
 */
const detectarHashtags = (texto) => {
  if (!texto || typeof texto !== 'string') {
    return [];
  }
  
  const regex = /#(\w+)/g;
  const hashtags = [];
  let match;
  
  while ((match = regex.exec(texto)) !== null) {
    hashtags.push(match[1].toLowerCase());
  }
  
  return [...new Set(hashtags)]; // Eliminar duplicados
};

/**
 * Filtra contenido potencialmente ofensivo
 * @param {string} texto - El texto a filtrar
 * @returns {object} - { filtrado: string, censurado: boolean }
 */
const filtrarContenidoOfensivo = (texto) => {
  if (!texto || typeof texto !== 'string') {
    return { filtrado: '', censurado: false };
  }
  
  // Lista básica de palabras ofensivas (expandir según necesidades)
  const palabrasOfensivas = [
    'idiota', 'estupido', 'tonto', 'imbecil', 'pendejo', 'cabrón'
    // Agregar más palabras según necesidades de moderación
  ];
  
  let textoFiltrado = texto;
  let censurado = false;
  
  palabrasOfensivas.forEach(palabra => {
    const regex = new RegExp(`\\b${palabra}\\b`, 'gi');
    if (regex.test(textoFiltrado)) {
      censurado = true;
      textoFiltrado = textoFiltrado.replace(regex, '*'.repeat(palabra.length));
    }
  });
  
  return {
    filtrado: textoFiltrado,
    censurado
  };
};

/**
 * Calcula estadísticas de engagement
 * @param {number} likes - Número de likes
 * @param {number} comentarios - Número de comentarios
 * @param {number} vistas - Número de vistas (opcional)
 * @returns {object} - Estadísticas calculadas
 */
const calcularEngagement = (likes, comentarios, vistas = 0) => {
  const totalInteracciones = likes + comentarios;
  
  let tasaEngagement = 0;
  if (vistas > 0) {
    tasaEngagement = (totalInteracciones / vistas) * 100;
  }
  
  return {
    totalInteracciones,
    tasaEngagement: Math.round(tasaEngagement * 100) / 100,
    ratioLikesComentarios: comentarios > 0 ? likes / comentarios : likes,
    nivelEngagement: determinarNivelEngagement(tasaEngagement)
  };
};

/**
 * Determina el nivel de engagement basado en la tasa
 * @param {number} tasa - Tasa de engagement
 * @returns {string} - Nivel de engagement
 */
const determinarNivelEngagement = (tasa) => {
  if (tasa >= 5) return 'excelente';
  if (tasa >= 3) return 'bueno';
  if (tasa >= 1) return 'regular';
  return 'bajo';
};

/**
 * Genera información básica del usuario
 * @param {string} usuarioId - ID del usuario
 * @param {string} tipoUsuario - Tipo de usuario
 * @param {string} nombre - Nombre del usuario (opcional)
 * @param {string} email - Email del usuario (opcional)
 * @returns {object} - Usuario formateado
 */
const generarInfoUsuario = (usuarioId, tipoUsuario, nombre = null, email = null) => {
  return {
    nombre: nombre || `Usuario_${usuarioId}`,
    email: email || '',
    avatar: '',
    rol: determinarRol(tipoUsuario)
  };
};

/**
 * Determina el rol según el tipo de usuario
 * @param {string} tipoUsuario - Tipo de usuario
 * @returns {string} - Rol del usuario
 */
const determinarRol = (tipoUsuario) => {
  switch (tipoUsuario) {
    case 'empresa': return 'representante';
    case 'ong': return 'coordinador';
    case 'integrante_externo': return 'participante';
    default: return 'usuario';
  }
};

/**
 * Genera un resumen de actividad social
 * @param {Array} likes - Array de likes
 * @param {Array} comentarios - Array de comentarios
 * @returns {object} - Resumen de actividad
 */
const generarResumenActividad = (likes, comentarios) => {
  const totalLikes = likes.length;
  const totalComentarios = comentarios.length;
  
  // Análisis por tipo de usuario
  const likesPorTipo = likes.reduce((acc, like) => {
    acc[like.tipoUsuario] = (acc[like.tipoUsuario] || 0) + 1;
    return acc;
  }, {});
  
  const comentariosPorTipo = comentarios.reduce((acc, comentario) => {
    acc[comentario.tipoUsuario] = (acc[comentario.tipoUsuario] || 0) + 1;
    return acc;
  }, {});
  
  // Análisis de sentimientos en comentarios
  const sentimientos = comentarios.reduce((acc, comentario) => {
    acc[comentario.sentimiento] = (acc[comentario.sentimiento] || 0) + 1;
    return acc;
  }, {});
  
  return {
    resumen: {
      totalLikes,
      totalComentarios,
      totalInteracciones: totalLikes + totalComentarios
    },
    distribucion: {
      likesPorTipo,
      comentariosPorTipo
    },
    sentimientos,
    engagement: calcularEngagement(totalLikes, totalComentarios)
  };
};

/**
 * Sanitiza el contenido para prevenir XSS
 * @param {string} contenido - Contenido a sanitizar
 * @returns {string} - Contenido sanitizado
 */
const sanitizarContenido = (contenido) => {
  if (!contenido || typeof contenido !== 'string') {
    return '';
  }
  
  return contenido
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
};

/**
 * Valida que un ObjectId sea válido
 * @param {string} id - ID a validar
 * @returns {boolean} - true si es válido
 */
const esObjectIdValido = (id) => {
  if (!id) return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

module.exports = {
  analizarSentimiento,
  validarContenidoComentario,
  validarContenidoRespuesta,
  puedeEditarComentario,
  detectarMenciones,
  detectarHashtags,
  filtrarContenidoOfensivo,
  calcularEngagement,
  determinarNivelEngagement,
  generarInfoUsuario,
  determinarRol,
  generarResumenActividad,
  sanitizarContenido,
  esObjectIdValido
};