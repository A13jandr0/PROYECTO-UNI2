const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  // Tipo de entidad que recibe el like
  tipoEntidad: {
    type: String,
    enum: ['evento', 'mega_evento', 'comentario'],
    required: true
  },
  
  // ID de la entidad (evento o mega evento) en MongoDB
  entidadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  
  // Tipo de usuario que da el like
  tipoUsuario: {
    type: String,
    enum: ['Empresa', 'Integrante externo', 'Super admin'],
    required: true
  },
  
  // ID del usuario (puede ser cualquier número o string)
  usuarioId: {
    type: String,
    required: true
  },
  
  // Información del usuario (guardada directamente)
  infoUsuario: {
    nombre: {
      type: String,
      required: true
    },
    email: String,
    avatar: String,
    tipoUsuario: {
      type: String,
      enum: ['Empresa', 'Integrante externo', 'Super admin']
    }
  },
  
  // Metadatos
  fechaLike: {
    type: Date,
    default: Date.now
  },
  
  activo: {
    type: Boolean,
    default: true
  },
  
  // IP y metadata para analytics
  metadata: {
    ip: String,
    userAgent: String,
    ubicacion: {
      ciudad: String,
      pais: String
    }
  }
}, {
  timestamps: true
});

// Índices para optimizar consultas
likeSchema.index({ tipoEntidad: 1, entidadId: 1 });
likeSchema.index({ usuarioId: 1, tipoUsuario: 1 });
likeSchema.index({ tipoEntidad: 1, entidadId: 1, usuarioId: 1, tipoUsuario: 1 }, { unique: true });
likeSchema.index({ fechaLike: -1 });
likeSchema.index({ activo: 1 });

// Métodos estáticos
likeSchema.statics.contarLikes = function(tipoEntidad, entidadId) {
  return this.countDocuments({
    tipoEntidad,
    entidadId,
    activo: true
  });
};

likeSchema.statics.verificarLike = function(tipoEntidad, entidadId, usuarioId, tipoUsuario) {
  return this.findOne({
    tipoEntidad,
    entidadId,
    usuarioId,
    tipoUsuario,
    activo: true
  });
};

likeSchema.statics.obtenerLikesRecientes = function(dias = 7) {
  const fechaLimite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        fechaLike: { $gte: fechaLimite },
        activo: true
      }
    },
    {
      $group: {
        _id: {
          tipoEntidad: '$tipoEntidad',
          entidadId: '$entidadId'
        },
        totalLikes: { $sum: 1 },
        ultimoLike: { $max: '$fechaLike' }
      }
    },
    {
      $sort: { totalLikes: -1 }
    }
  ]);
};

// Método para obtener estadísticas por tipo de usuario
likeSchema.statics.obtenerEstadisticasPorTipo = function(tipoEntidad, entidadId) {
  return this.aggregate([
    {
      $match: {
        tipoEntidad,
        entidadId,
        activo: true
      }
    },
    {
      $group: {
        _id: '$tipoUsuario',
        count: { $sum: 1 },
        ultimoLike: { $max: '$fechaLike' }
      }
    }
  ]);
};

const Like = mongoose.model('Like', likeSchema);

module.exports = Like;