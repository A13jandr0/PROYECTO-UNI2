const mongoose = require('mongoose');

const respuestaSchema = new mongoose.Schema({
  // Usuario que responde
  tipoUsuario: {
    type: String,
    enum: ['empresa', 'integrante_externo', 'ong'],
    required: true
  },
  
  usuarioId: {
    type: String,
    required: true
  },
  
  infoUsuario: {
    nombre: {
      type: String,
      required: true
    },
    email: String,
    avatar: String,
    tipoUsuario: String
  },
  
  // Contenido
  contenido: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  
  // Estado y moderación
  estado: {
    type: String,
    enum: ['activo', 'moderado', 'eliminado', 'reportado'],
    default: 'activo'
  },
  
  fechaRespuesta: {
    type: Date,
    default: Date.now
  },
  
  // Likes en respuestas
  likes: {
    type: Number,
    default: 0
  },
  
  // Reportes
  reportes: [{
    usuarioId: String,
    tipoUsuario: String,
    motivo: String,
    fecha: { type: Date, default: Date.now }
  }]
});

const commentSchema = new mongoose.Schema({
  // Entidad comentada
  tipoEntidad: {
    type: String,
    enum: ['evento', 'mega_evento'],
    required: true
  },
  
  entidadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  
  // Usuario que comenta
  tipoUsuario: {
    type: String,
    enum: ['Empresa', 'Integrante externo', 'Super admin','ONG'],
    required: true
  },
  
  usuarioId: {
    type: String,
    required: true
  },
  
  infoUsuario: {
    nombre: {
      type: String,
      required: true
    },
    email: String,
    avatar: String,
    rol: String // Para ONGs: 'coordinador', para empresas: 'representante', etc.
  },
  
  // Contenido del comentario
  contenido: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  
  // Clasificación del comentario
  categoria: {
    type: String,
    enum: ['consulta', 'sugerencia', 'felicitacion', 'critica', 'testimonio', 'general'],
    default: 'general'
  },
  
  // Sentimiento (se puede calcular automáticamente)
  sentimiento: {
    type: String,
    enum: ['positivo', 'neutral', 'negativo'],
    default: 'neutral'
  },
  
  // Estado y moderación
  estado: {
    type: String,
    enum: ['activo', 'pendiente_moderacion', 'aprobado', 'rechazado', 'eliminado', 'reportado'],
    default: 'activo'
  },
  
  // Interacciones
  likes: {
    type: Number,
    default: 0
  },
  
  respuestas: [respuestaSchema],
  
  // Si es respuesta a otro comentario
  comentarioPadreId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  },
  
  // Etiquetas y menciones
  etiquetas: [String],
  menciones: [{
    usuarioId: String,
    tipoUsuario: String,
    nombre: String
  }],
  
  // Moderación y reportes
  reportes: [{
    usuarioId: String,
    tipoUsuario: String,
    motivo: {
      type: String,
      enum: ['spam', 'lenguaje_ofensivo', 'contenido_inapropiado', 'desinformacion', 'otro']
    },
    descripcion: String,
    fecha: { type: Date, default: Date.now }
  }],
  
  moderadoPor: {
    usuarioId: String,
    fecha: Date,
    accion: String,
    motivo: String
  },
  
  // Metadatos
  metadata: {
    ip: String,
    userAgent: String,
    ubicacion: {
      ciudad: String,
      pais: String
    },
    editado: {
      type: Boolean,
      default: false
    },
    fechaEdicion: Date,
    versionesAnteriores: [String]
  },
  
  fechaComentario: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Índices
commentSchema.index({ tipoEntidad: 1, entidadId: 1 });
commentSchema.index({ usuarioId: 1, tipoUsuario: 1 });
commentSchema.index({ fechaComentario: -1 });
commentSchema.index({ estado: 1 });
commentSchema.index({ categoria: 1 });
commentSchema.index({ sentimiento: 1 });
commentSchema.index({ comentarioPadreId: 1 });

// Métodos de instancia
commentSchema.methods.agregarRespuesta = function(respuestaData) {
  this.respuestas.push(respuestaData);
  return this.save();
};

commentSchema.methods.marcarComoEditado = function(nuevoContenido) {
  if (!this.metadata.versionesAnteriores) {
    this.metadata.versionesAnteriores = [];
  }
  
  this.metadata.versionesAnteriores.push(this.contenido);
  this.contenido = nuevoContenido;
  this.metadata.editado = true;
  this.metadata.fechaEdicion = new Date();
  
  return this.save();
};

commentSchema.methods.reportar = function(reporteData) {
  this.reportes.push(reporteData);
  
  // Si tiene más de 3 reportes, cambiar estado
  if (this.reportes.length >= 3) {
    this.estado = 'reportado';
  }
  
  return this.save();
};

// Métodos estáticos
commentSchema.statics.contarComentarios = function(tipoEntidad, entidadId) {
  return this.countDocuments({
    tipoEntidad,
    entidadId,
    estado: { $in: ['activo', 'aprobado'] }
  });
};

commentSchema.statics.obtenerComentariosRecientes = function(tipoEntidad, entidadId, limite = 10) {
  return this.find({
    tipoEntidad,
    entidadId,
    estado: { $in: ['activo', 'aprobado'] },
    comentarioPadreId: null
  })
  .sort({ fechaComentario: -1 })
  .limit(limite)
  .lean();
};

commentSchema.statics.estadisticasSentimiento = function(tipoEntidad, entidadId) {
  return this.aggregate([
    {
      $match: {
        tipoEntidad,
        entidadId,
        estado: { $in: ['activo', 'aprobado'] }
      }
    },
    {
      $group: {
        _id: '$sentimiento',
        count: { $sum: 1 }
      }
    }
  ]);
};

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;