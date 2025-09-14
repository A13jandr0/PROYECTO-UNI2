const mongoose = require('mongoose');
const imagenSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true
  },
  descripcion: {
    type: String,
    default: ''
  },
  tipo: {
    type: String,
    enum: ['galeria', 'portada', 'promocional', 'banner'],
    default: 'promocional'
  },
  datos: {
    type: Buffer,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  tamaño: {
    type: Number,
    required: true
  },
  fechaSubida: {
    type: Date,
    default: Date.now
  },
  orden: {
    type: Number,
    default: 0
  },
  activa: {
    type: Boolean,
    default: true
  }
});

const participanteExternoSchema = new mongoose.Schema({
  integranteId: {
    type: Number,
    required: true
  },
  tipoParticipacion: {
    type: String,
    enum: ['participante', 'voluntario', 'ponente', 'facilitador'],
    default: 'participante'
  },
  habilidadesOfrecidas: [String],
  disponibilidad: {
    type: String,
    enum: ['completa', 'parcial', 'horarios_especificos'],
    default: 'completa'
  },
  estadoParticipacion: {
    type: String,
    enum: ['en_espera', 'confirmado', 'rechazado', 'cancelado'],
    default: 'confirmado'
  },
  fechaRegistro: {
    type: Date,
    default: Date.now
  },
  asistencia: {
    type: Boolean,
    default: null
  },
  comentarios: {
    type: String,
    maxlength: 1000
  },
  eventoOrigenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evento'
  },
  certificadoGenerado: {
    type: Boolean,
    default: false
  }
});
const ubicacionSchema = new mongoose.Schema({
  direccion: {
    type: String,
    required: true
  },
  ciudad: {
    type: String,
    default: 'Santa Cruz'
  },
  departamento: {
    type: String,
    default: 'Santa Cruz'
  },
  pais: {
    type: String,
    default: 'Bolivia'
  },
  tipoLocacion: {
    type: String,
    enum: ['presencial', 'virtual', 'hibrido'],
    default: 'presencial'
  },
  coordenadas: {
    latitud: Number,
    longitud: Number
  },
  enlaceVirtual: String,
  capacidadVenue: Number,
  facilidades: [String]
}, { _id: false });
const metricasSchema = new mongoose.Schema({
  totalEventosAbsorbidos: {
    type: Number,
    default: 0
  },
  totalInscritos: {
    type: Number,
    default: 0
  },
  totalAsistentes: {
    type: Number,
    default: 0
  },
  totalPatrocinadores: {
    type: Number,
    default: 0
  },
  porcentajeAsistencia: {
    type: Number,
    default: 0
  },
  fechaCalculoFinal: Date,
  presupuesto: {
    totalRecaudado: Number,
    totalGastado: Number,
    balanceFinal: Number
  },
  satisfaccionPromedio: {
    type: Number,
    min: 1,
    max: 5
  },
  certificadosEmitidos: {
    type: Number,
    default: 0
  },
  impactoSocial: {
    personasBeneficiadas: Number,
    comunidadesImpactadas: Number,
    proyectosGenerados: Number
  }
}, { _id: false });

const historialEstadoSchema = new mongoose.Schema({
  estadoAnterior: {
    type: String,
    enum: ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado']
  },
  estadoNuevo: {
    type: String,
    enum: ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado'],
    required: true
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  motivo: {
    type: String,
    maxlength: 500
  },
  usuarioId: {
    type: Number,
    required: true
  },
  observaciones: String,
  aprobadoPor: Number,
  fechaAprobacion: Date
});
const megaEventoSchema = new mongoose.Schema({
  sqlMegaEventoId: {
    type: Number,
    required: true,
  },
  titulo: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 200
  },
  descripcion: {
    type: String,
    trim: true,
    maxlength: 5000
  },
  objetivos: [String],
  resultadosEsperados: [String],
  fechaInicio: {
    type: Date,
    required: true
  },
  fechaFin: {
    type: Date,
    required: true,
    validate: {
      validator: function(v) {
        return v > this.fechaInicio;
      },
      message: 'La fecha de fin debe ser posterior a la fecha de inicio'
    }
  },
  fechaLimiteInscripcion: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v <= this.fechaInicio;
      },
      message: 'La fecha límite de inscripción debe ser anterior a la fecha de inicio'
    }
  },
  fechaFinalizacion: Date,
  fechaCancelacion: Date,
  ubicacion: {
    type: ubicacionSchema,
    required: true
  },
  categoria: {
    type: String,
    enum: ['social', 'ambiental', 'educativo', 'salud', 'cultural', 'deportivo', 'tecnologico', 'otro'],
    default: 'social'
  },
  tags: [{
    type: String,
    trim: true
  }],
  ongOrganizadoraPrincipal: {
    type: Number,
    required: true
  },
  creadoPor: {
    type: Number,
    required: true
  },
  eventosAbsorbidos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evento'
  }],
  empresasPatrocinadoras: [{
    type: Number
  }],
  empresasAuspiciadoras: [{
    type: Number
  }],
  participantesExternos: {
    type:[participanteExternoSchema],
    default: []},
  capacidadMaxima: {
    type: Number,
    min: 1,
    max: 50000
  },
  inscripcionAbierta: {
    type: Boolean,
    default: false
  },
  requiereAprobacion: {
    type: Boolean,
    default: false
  },
  certificacionDisponible: {
    type: Boolean,
    default: false
  },
  estado: {
    type: String,
    enum: ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado'],
    default: 'planificacion'
  },
  esPublico: {
    type: Boolean,
    default: false
  },
  activo: {
    type: Boolean,
    default: true
  },
  imagenesPromocionales: [imagenSchema],
  contactoInfo: {
    emailPrincipal: String,
    telefonoPrincipal: String,
    sitioWeb: String,
    redesSociales: {
      facebook: String,
      instagram: String,
      twitter: String,
      linkedin: String
    }
  },
  metricas: {
    type: metricasSchema,
    default: function() {
      return {
        totalEventosAbsorbidos: 0,
        totalInscritos: 0,
        totalAsistentes: 0,
        totalPatrocinadores: 0,
        porcentajeAsistencia: 0,
        certificadosEmitidos: 0
      };
    }
  },
  historialEstados: [historialEstadoSchema]
}, {
  timestamps: true
});

megaEventoSchema.index({ sqlMegaEventoId: 1 }, { unique: true });
megaEventoSchema.index({ ongOrganizadoraPrincipal: 1 });
megaEventoSchema.index({ estado: 1 });
megaEventoSchema.index({ fechaInicio: 1 });
megaEventoSchema.index({ categoria: 1 });
megaEventoSchema.index({ 'ubicacion.ciudad': 1 });
megaEventoSchema.index({ esPublico: 1, activo: 1 });
megaEventoSchema.index({ titulo: 'text', descripcion: 'text', tags: 'text' });
megaEventoSchema.index({ eventosAbsorbidos: 1 });
megaEventoSchema.index({ 'participantesExternos.integranteId': 1 });

megaEventoSchema.methods.toSafeObject = function() {
  const megaEvento = this.toObject();
  
  if (megaEvento.imagenesPromocionales && megaEvento.imagenesPromocionales.length > 0) {
    megaEvento.imagenesPromocionales = megaEvento.imagenesPromocionales
      .filter(img => img.activa)
      .sort((a, b) => a.orden - b.orden)
      .map(function(imagen) {
        return {
          _id: imagen._id,
          nombre: imagen.nombre,
          descripcion: imagen.descripcion,
          tipo: imagen.tipo,
          tamaño: imagen.tamaño,
          fechaSubida: imagen.fechaSubida,
          orden: imagen.orden,
          url: 'data:' + imagen.mimeType + ';base64,' + imagen.datos.toString('base64')
        };
      });
  }
  
  return megaEvento;
};

megaEventoSchema.methods.actualizarMetricas = function() {
  const confirmados = this.participantesExternos.filter(p => p.estadoParticipacion === 'confirmado');
  this.metricas.totalInscritos = confirmados.length;
  
  const asistentes = this.participantesExternos.filter(p => p.asistencia === true);
  this.metricas.totalAsistentes = asistentes.length;
  this.metricas.totalEventosAbsorbidos = this.eventosAbsorbidos.length;
  this.metricas.totalPatrocinadores = this.empresasPatrocinadoras.length + this.empresasAuspiciadoras.length;
  this.metricas.porcentajeAsistencia = this.metricas.totalInscritos > 0 ? 
    Math.round((this.metricas.totalAsistentes / this.metricas.totalInscritos) * 100) : 0;
  
  this.metricas.certificadosEmitidos = this.participantesExternos.filter(p => p.certificadoGenerado).length;
  this.metricas.fechaCalculoFinal = new Date();
  
  return this.save();
};

megaEventoSchema.methods.cambiarEstado = function(nuevoEstado, usuarioId, motivo, observaciones) {
  const estadosValidos = ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado'];
  
  if (!estadosValidos.includes(nuevoEstado)) {
    throw new Error('Estado no válido');
  }
  
  const estadoAnterior = this.estado;
  
  if (nuevoEstado === 'convocatoria') {
    if (!this.titulo || !this.fechaInicio || !this.ubicacion) {
      throw new Error('Faltan datos básicos para abrir convocatoria');
    }
    if (this.eventosAbsorbidos.length === 0) {
      throw new Error('Debe tener al menos un evento absorbido para abrir convocatoria');
    }
    this.esPublico = true;
    this.inscripcionAbierta = true;
  } else if (nuevoEstado === 'organizacion') {
    if (this.eventosAbsorbidos.length === 0) {
      throw new Error('Debe tener eventos absorbidos para pasar a organización');
    }
  } else if (nuevoEstado === 'en_curso') {
    this.inscripcionAbierta = false;
  } else if (nuevoEstado === 'finalizado') {
    this.inscripcionAbierta = false;
    this.actualizarMetricas();
    this.fechaFinalizacion = new Date();
  } else if (nuevoEstado === 'cancelado') {
    this.esPublico = false;
    this.inscripcionAbierta = false;
    this.fechaCancelacion = new Date();
  }
  
  this.historialEstados.push({
    estadoAnterior,
    estadoNuevo: nuevoEstado,
    fecha: new Date(),
    motivo: motivo || `Cambio de ${estadoAnterior} a ${nuevoEstado}`,
    usuarioId,
    observaciones: observaciones || '',
    aprobadoPor: usuarioId,
    fechaAprobacion: new Date()
  });
  
  this.estado = nuevoEstado;
  return this.save();
};

megaEventoSchema.methods.agregarParticipanteExterno = function(participanteData) {
  // SI el documento ya existía sin este campo, forzamos el array:
  if (!Array.isArray(this.participantesExternos)) {
    this.participantesExternos = [];
  }

  // 1) Ya existe?
  const yaRegistrado = this.participantesExternos
    .some(p => p.integranteId === participanteData.integranteId);
  if (yaRegistrado) {
    throw new Error('El participante ya está registrado en este mega evento');
  }

  // 2) Capacidad máxima
  if (this.capacidadMaxima && this.participantesExternos.length >= this.capacidadMaxima) {
    throw new Error('Se ha alcanzado la capacidad máxima del mega evento');
  }

  // 3) Inscripciones abiertas?
  if (!this.inscripcionAbierta) {
    throw new Error('Las inscripciones están cerradas para este mega evento');
  }

  // 4) Fecha límite
  if (this.fechaLimiteInscripcion && new Date() > this.fechaLimiteInscripcion) {
    throw new Error('Se ha vencido la fecha límite de inscripción');
  }

  // 5) ¡Ahora sí podemos empujar!
  this.participantesExternos.push(participanteData);

  // 6) Recalcular métricas
  this.metricas.totalInscritos = this.participantesExternos
    .filter(p => p.estadoParticipacion === 'confirmado').length;

  return this.save();
};

megaEventoSchema.methods.absorberEvento = function(eventoId, eventoData) {
  const yaAbsorbido = this.eventosAbsorbidos.some(function(id) {
    return id.toString() === eventoId.toString();
  });
  
  if (yaAbsorbido) {
    throw new Error('El evento ya está absorbido por este mega evento');
  }

  if (!['planificacion', 'convocatoria'].includes(this.estado)) {
    throw new Error('Solo se pueden absorber eventos en estado de planificación o convocatoria');
  }

  this.eventosAbsorbidos.push(eventoId);
  
  if (eventoData && eventoData.participantes) {
    for (const participante of eventoData.participantes) {
      const yaExiste = this.participantesExternos.some(function(p) {
        return p.integranteId === participante.integranteId;
      });
      
      if (!yaExiste) {
        this.participantesExternos.push({
          ...participante,
          eventoOrigenId: eventoId,
          fechaRegistro: new Date()
        });
      }
    }
  }

  if (eventoData && eventoData.empresasPatrocinadoras) {
    for (const empresaId of eventoData.empresasPatrocinadoras) {
      if (!this.empresasPatrocinadoras.includes(empresaId)) {
        this.empresasPatrocinadoras.push(empresaId);
      }
    }
  }

  if (eventoData && eventoData.empresasAuspiciadoras) {
    for (const empresaId of eventoData.empresasAuspiciadoras) {
      if (!this.empresasAuspiciadoras.includes(empresaId)) {
        this.empresasAuspiciadoras.push(empresaId);
      }
    }
  }

  this.metricas.totalEventosAbsorbidos = this.eventosAbsorbidos.length;
  this.metricas.totalPatrocinadores = this.empresasPatrocinadoras.length + this.empresasAuspiciadoras.length;
  
  return this.save();
};

megaEventoSchema.methods.liberarEvento = function(eventoId) {
  const indice = this.eventosAbsorbidos.findIndex(function(id) {
    return id.toString() === eventoId.toString();
  });
  
  if (indice === -1) {
    throw new Error('El evento no está absorbido por este mega evento');
  }

  if (this.estado === 'finalizado') {
    throw new Error('No se pueden liberar eventos de un mega evento finalizado');
  }

  this.eventosAbsorbidos.splice(indice, 1);

  this.participantesExternos = this.participantesExternos.filter(function(p) {
    return !p.eventoOrigenId || p.eventoOrigenId.toString() !== eventoId.toString();
  });

  this.metricas.totalEventosAbsorbidos = this.eventosAbsorbidos.length;
  this.metricas.totalInscritos = this.participantesExternos.filter(p => p.estadoParticipacion === 'confirmado').length;
  
  return this.save();
};

megaEventoSchema.methods.registrarAsistencia = function(integranteId, asistencia) {
  const participante = this.participantesExternos.find(function(p) {
    return p.integranteId === parseInt(integranteId);
  });
  
  if (!participante) {
    throw new Error('Participante no encontrado en este mega evento');
  }

  participante.asistencia = asistencia;
  
  const totalAsistentes = this.participantesExternos.filter(function(p) {
    return p.asistencia === true;
  }).length;
  
  this.metricas.totalAsistentes = totalAsistentes;
  this.metricas.porcentajeAsistencia = this.participantesExternos.length > 0 ? 
    Math.round((totalAsistentes / this.participantesExternos.length) * 100) : 0;
  
  return this.save();
};

megaEventoSchema.methods.generarCertificado = function(integranteId) {
  const participante = this.participantesExternos.find(p => 
    p.integranteId === parseInt(integranteId) && 
    p.asistencia === true && 
    p.estadoParticipacion === 'confirmado'
  );
  
  if (!participante) {
    throw new Error('Participante no encontrado o no cumple requisitos');
  }
  
  if (!this.certificacionDisponible) {
    throw new Error('Este mega evento no ofrece certificación');
  }
  
  participante.certificadoGenerado = true;
  this.metricas.certificadosEmitidos = this.participantesExternos.filter(p => p.certificadoGenerado).length;
  
  return this.save();
};

megaEventoSchema.statics.buscar = function(termino, filtros) {
  const query = {
    activo: true,
    esPublico: true,
    estado: { $in: ['convocatoria', 'organizacion'] },
    $or: [
      { titulo: { $regex: termino, $options: 'i' } },
      { descripcion: { $regex: termino, $options: 'i' } },
      { tags: { $in: [new RegExp(termino, 'i')] } },
      { objetivos: { $in: [new RegExp(termino, 'i')] } }
    ]
  };

  if (filtros && filtros.categoria) query.categoria = filtros.categoria;
  if (filtros && filtros.ciudad) query['ubicacion.ciudad'] = filtros.ciudad;
  if (filtros && (filtros.fechaDesde || filtros.fechaHasta)) {
    query.fechaInicio = {};
    if (filtros.fechaDesde) query.fechaInicio.$gte = new Date(filtros.fechaDesde);
    if (filtros.fechaHasta) query.fechaInicio.$lte = new Date(filtros.fechaHasta);
  }

  return this.find(query).sort({ fechaInicio: 1 });
};

megaEventoSchema.statics.megaEventosProximos = function(dias) {
  const diasParaBuscar = dias || 60;
  const ahora = new Date();
  const fechaLimite = new Date(ahora.getTime() + diasParaBuscar * 24 * 60 * 60 * 1000);

  return this.find({
    activo: true,
    esPublico: true,
    estado: { $in: ['convocatoria', 'organizacion'] },
    fechaInicio: {
      $gte: ahora,
      $lte: fechaLimite
    }
  }).sort({ fechaInicio: 1 });
};

megaEventoSchema.statics.conEventosAbsorbidos = function() {
  return this.find({
    activo: true,
    'eventosAbsorbidos.0': { $exists: true }
  }).populate('eventosAbsorbidos', 'titulo fechaInicio tipoEvento estado');
};

megaEventoSchema.statics.estadisticasGenerales = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalMegaEventos: { $sum: 1 },
        megaEventosActivos: { $sum: { $cond: [{ $eq: ['$activo', true] }, 1, 0] } },
        totalEventosAbsorbidos: { $sum: '$metricas.totalEventosAbsorbidos' },
        totalParticipantes: { $sum: '$metricas.totalInscritos' },
        promedioSatisfaccion: { $avg: '$metricas.satisfaccionPromedio' }
      }
    }
  ]);
};

megaEventoSchema.pre('save', function(next) {
  if (this.isModified('participantesExternos')) {
    const confirmados = this.participantesExternos.filter(function(p) {
      return p.estadoParticipacion === 'confirmado';
    });
    this.metricas.totalInscritos = confirmados.length;
    
    const asistentes = this.participantesExternos.filter(function(p) {
      return p.asistencia === true;
    });
    this.metricas.totalAsistentes = asistentes.length;
    this.metricas.porcentajeAsistencia = this.metricas.totalInscritos > 0 ? 
      Math.round((asistentes.length / this.metricas.totalInscritos) * 100) : 0;
  }

  if (this.isModified('eventosAbsorbidos')) {
    this.metricas.totalEventosAbsorbidos = this.eventosAbsorbidos.length;
  }

  if (this.isModified('empresasPatrocinadoras') || this.isModified('empresasAuspiciadoras')) {
    this.metricas.totalPatrocinadores = this.empresasPatrocinadoras.length + this.empresasAuspiciadoras.length;
  }

  if (this.fechaFin && this.fechaInicio && this.fechaFin <= this.fechaInicio) {
    return next(new Error('La fecha de fin debe ser posterior a la fecha de inicio'));
  }

  if (this.fechaLimiteInscripcion && this.fechaInicio && this.fechaLimiteInscripcion > this.fechaInicio) {
    return next(new Error('La fecha límite de inscripción debe ser anterior a la fecha de inicio'));
  }
  next();
});

megaEventoSchema.post('save', function(doc, next) {
  console.log('✅ Mega evento "' + doc.titulo + '" guardado exitosamente');
  console.log('   - Eventos absorbidos:', doc.metricas.totalEventosAbsorbidos);
  console.log('   - Participantes:', doc.metricas.totalInscritos);
  console.log('   - Estado:', doc.estado);
  next();
});

const MegaEvento = mongoose.model('MegaEvento', megaEventoSchema);

module.exports = MegaEvento;