const { poolPromise } = require('../config/db');
const MegaEvento = require('../models/MegaEvento.model');
const Evento = require('../models/evento.model');
const multer = require('multer');
const sharp = require('sharp');

const ESTADOS_MEGA_EVENTO = {
  PLANIFICACION: 'planificacion',
  CONVOCATORIA: 'convocatoria', 
  ORGANIZACION: 'organizacion',
  EN_CURSO: 'en_curso',
  FINALIZADO: 'finalizado',
  CANCELADO: 'cancelado'
};

const ESTADOS_EVENTOS_ABSORBIBLES = ['publicado'];

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

const processImages = async (files) => {
  if (!files || files.length === 0) return [];
  const processedImages = [];
  
  for (const file of files) {
    try {
      const processedBuffer = await sharp(file.buffer)
        .resize(1200, 800, { 
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: 85,
          progressive: true
        })
        .toBuffer();

      processedImages.push({
        nombre: file.originalname,
        descripcion: '',
        tipo: 'promocional',
        datos: processedBuffer,
        mimeType: 'image/jpeg',
        tamaño: processedBuffer.length
      });
    } catch (error) {
      console.error('Error procesando imagen:', error);
      throw new Error(`Error procesando la imagen ${file.originalname}`);
    }
  }
  
  return processedImages;
};

const createMegaEvent = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      fechaInicio,
      fechaFin,
       fechaLimiteInscripcion,
      ubicacion,
      estado,
      categoria,
      ongOrganizadoraPrincipal,
      capacidadMaxima,
      patrocinadores = [],
      auspiciadores = [],
      requiereAprobacion = false,
      certificacionDisponible = false,
      tags = [],
      objetivos = [],
      resultadosEsperados = [],
      contactoInfo = {},
      esPublico: esPublicoFinal = false,
    } = req.body;   

    console.log('📝 Creando mega evento:', { titulo, ongOrganizadoraPrincipal, estado });

    if (!titulo || !fechaInicio || !fechaFin || !ongOrganizadoraPrincipal || !ubicacion) {
      return res.status(400).json({ 
        success: false,
        error: 'Faltan campos requeridos'
      });
    }

    const pool = await poolPromise;
    const ongCheck = await pool.request()
      .input('ongId', ongOrganizadoraPrincipal)
      .query(`
        SELECT u.tipo_usuario 
        FROM usuarios u 
        WHERE u.id_usuario = @ongId AND u.activo = 1 AND u.tipo_usuario = 'ONG'
      `);

    if (ongCheck.recordset.length === 0) {
      return res.status(403).json({ 
        success: false,
        error: 'Solo las ONGs activas pueden crear mega eventos' 
      });
    }

    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate = new Date(fechaFin);
    
    if (fechaFinDate <= fechaInicioDate) {
      return res.status(400).json({
        success: false,
        error: 'La fecha de fin debe ser posterior a la fecha de inicio'
      });
    }

    let limiteDate = null;
    if (fechaLimiteInscripcion) {
      limiteDate = new Date(fechaLimiteInscripcion);
      if (limiteDate >= fechaInicioDate) {
        return res.status(400).json({
          success: false,
          error: 'La fecha límite debe ser anterior a la fecha de inicio'
        });
      }
    }

    const patrocinadoresList = Array.isArray(patrocinadores) ? 
      patrocinadores : JSON.parse(patrocinadores || '[]');
    const auspiciadoresList = Array.isArray(auspiciadores) ? 
      auspiciadores : JSON.parse(auspiciadores || '[]');

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const sqlResult = await transaction.request()
      .input('titulo',                    titulo)
      .input('descripcion',               descripcion || null)
      .input('fecha_inicio',              fechaInicioDate)
      .input('fecha_fin',                 fechaFinDate)
      .input('fecha_limite_inscripcion',  limiteDate)           // ← aquí
      .input('ubicacion',                 typeof ubicacion === 'string' ? ubicacion : ubicacion.direccion)
      .input('categoria',                 categoria || 'social')
      .input('ong_organizadora_principal', parseInt(ongOrganizadoraPrincipal))
      .input('capacidad_maxima',          capacidadMaxima ? parseInt(capacidadMaxima) : null)
      .input('es_publico',                esPublicoFinal)
      .input('estado',                    estado)
      .query(`
        INSERT INTO mega_eventos (
          titulo, descripcion,
          fecha_inicio, fecha_fin, fecha_limite_inscripcion,
          ubicacion, categoria,
          ong_organizadora_principal, capacidad_maxima,
          es_publico, estado
        )
        OUTPUT INSERTED.MegaEventoID
        VALUES (
          @titulo, @descripcion,
          @fecha_inicio, @fecha_fin, @fecha_limite_inscripcion,
          @ubicacion, @categoria,
          @ong_organizadora_principal, @capacidad_maxima,
          @es_publico, @estado
        )
      `);

      const sqlMegaEventoId = sqlResult.recordset[0].MegaEventoID;

      for (const empresaId of patrocinadoresList) {
        await transaction.request()
          .input('mega_evento_id', sqlMegaEventoId)
          .input('empresa_id', parseInt(empresaId))
          .input('tipo_patrocinio', 'patrocinador')
          .query(`
            INSERT INTO mega_evento_patrocinadores (mega_evento_id, empresa_id, tipo_patrocinio)
            VALUES (@mega_evento_id, @empresa_id, @tipo_patrocinio)
          `);
      }

      for (const empresaId of auspiciadoresList) {
        await transaction.request()
          .input('mega_evento_id', sqlMegaEventoId)
          .input('empresa_id', parseInt(empresaId))
          .input('tipo_patrocinio', 'auspiciador')
          .query(`
            INSERT INTO mega_evento_patrocinadores (mega_evento_id, empresa_id, tipo_patrocinio)
            VALUES (@mega_evento_id, @empresa_id, @tipo_patrocinio)
          `);
      }

      let imagenesPromocionales = [];
      if (req.files && req.files.length > 0) {
        imagenesPromocionales = await processImages(req.files);
      }

      const megaEventoData = {
        sqlMegaEventoId,
        titulo,
        descripcion: descripcion || '',
        fechaInicio: fechaInicioDate,
        fechaFin: fechaFinDate,
        fechaLimiteInscripcion: limiteDate,
        ubicacion: typeof ubicacion === 'string' 
          ? { direccion: ubicacion, ciudad: 'Santa Cruz', tipoLocacion: 'presencial' }
          : ubicacion,
        categoria: categoria || 'social',
        tags: Array.isArray(tags) ? tags : JSON.parse(tags || '[]'),
        objetivos: Array.isArray(objetivos) ? objetivos : JSON.parse(objetivos || '[]'),
        resultadosEsperados: Array.isArray(resultadosEsperados) ? resultadosEsperados : JSON.parse(resultadosEsperados || '[]'),
        ongOrganizadoraPrincipal: parseInt(ongOrganizadoraPrincipal),
        capacidadMaxima: capacidadMaxima ? parseInt(capacidadMaxima) : null,
        requiereAprobacion,
        certificacionDisponible,
        contactoInfo,
        imagenesPromocionales,
        estado: estado,
        esPublico: esPublicoFinal,
        activo: true,
        creadoPor: parseInt(ongOrganizadoraPrincipal),
        eventosAbsorbidos: [],
        empresasPatrocinadoras: [...patrocinadoresList.map(id => parseInt(id))],
        empresasAuspiciadoras: [...auspiciadoresList.map(id => parseInt(id))],
        metricas: {
          totalEventosAbsorbidos: 0,
          totalInscritos: 0,
          totalAsistentes: 0,
          totalPatrocinadores: patrocinadoresList.length + auspiciadoresList.length,
          porcentajeAsistencia: 0
        }
      };

      const nuevoMegaEvento = new MegaEvento(megaEventoData);
      await nuevoMegaEvento.save();

      await transaction.commit();

      res.status(201).json({
        success: true,
        message: 'Mega evento creado exitosamente',
        megaEvento: {
          id: nuevoMegaEvento._id,
          sqlMegaEventoId,
          titulo: nuevoMegaEvento.titulo,
          estado: nuevoMegaEvento.estado,
          fechaLimiteInscripcion: nuevoMegaEvento.fechaLimiteInscripcion,
          esPublico: nuevoMegaEvento.esPublico,
          totalImagenes: nuevoMegaEvento.imagenesPromocionales.length,
          totalPatrocinadores: patrocinadoresList.length,
          totalAuspiciadores: auspiciadoresList.length
        }
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('💥 Error creando mega evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al crear mega evento'
    });
  }
};

const getEventsAvailableForAbsorption = async (req, res) => {
  try {
    const { ciudad, categoria, limite = 20 } = req.query;

    const filtros = {
      estado: { $in: ESTADOS_EVENTOS_ABSORBIBLES },
      activo: true,
      megaEventoId: { $exists: false },
      fechaInicio: { $gte: new Date() }
    };

    if (categoria) filtros.tipoEvento = categoria;
    if (ciudad) filtros['locacion.ciudad'] = ciudad;

    const eventos = await Evento.find(filtros)
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();

    const pool = await poolPromise;
    const eventosEnriquecidos = await Promise.all(eventos.map(async (evento) => {
      const ongResult = await pool.request()
        .input('ongId', evento.ongId)
        .query(`
          SELECT o.nombre_ong, u.nombre_usuario
          FROM onGs o
          INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
          WHERE o.id_usuario = @ongId
        `);

      const participantesResult = await pool.request()
        .input('eventoId', evento.sqlEventoId)
        .query(`
          SELECT COUNT(*) as total
          FROM evento_integrantes_externos
          WHERE evento_id = @eventoId
        `);

      const patrocinadoresResult = await pool.request()
        .input('eventoId', evento.sqlEventoId)
        .query(`
          SELECT COUNT(*) as total
          FROM evento_patrocinadores
          WHERE evento_id = @eventoId
        `);

      const auspiciadoresResult = await pool.request()
        .input('eventoId', evento.sqlEventoId)
        .query(`
          SELECT COUNT(*) as total
          FROM evento_Auspisiadores
          WHERE evento_id = @eventoId
        `);

      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        const imagenPrincipal = evento.imagenesPromocionales[0];
        evento.imagenPrincipal = {
          url: `data:${imagenPrincipal.mimeType};base64,${imagenPrincipal.datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;

      return {
        ...evento,
        ongOrganizadora: ongResult.recordset[0] || null,
        estadisticas: {
          totalParticipantes: participantesResult.recordset[0].total,
          totalPatrocinadores: patrocinadoresResult.recordset[0].total,
          totalAuspiciadores: auspiciadoresResult.recordset[0].total
        }
      };
    }));

    res.json({
      success: true,
      eventos: eventosEnriquecidos,
      total: eventosEnriquecidos.length,
      mensaje: 'Eventos disponibles para ser absorbidos por mega eventos'
    });

  } catch (error) {
    console.error('Error obteniendo eventos disponibles:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos disponibles'
    });
  }
};

const absorbEvents = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { eventosIds, ongId } = req.body;

    console.log('🔄 Absorbiendo eventos:', { megaEventoId, eventosIds });

    if (!Array.isArray(eventosIds) || eventosIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar al menos un evento para absorber'
      });
    }

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    if (megaEvento.ongOrganizadoraPrincipal !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para absorber eventos en este mega evento'
      });
    }

    if (!['planificacion', 'convocatoria'].includes(megaEvento.estado)) {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden absorber eventos en estado de planificación o convocatoria'
      });
    }

    const eventos = await Evento.find({
      _id: { $in: eventosIds },
      estado: { $in: ESTADOS_EVENTOS_ABSORBIBLES },
      activo: true,
      megaEventoId: { $exists: false }
    });

    if (eventos.length !== eventosIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Algunos eventos no están disponibles para absorber'
      });
    }

    const pool = await poolPromise;
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      let totalParticipantesAbsorbidos = 0;
      let totalEmpresasAbsorbidas = 0;
      const eventosAbsorbidosInfo = [];

      for (const evento of eventos) {
        console.log(`📍 Procesando evento: ${evento.titulo}`);

        const participantesResult = await pool.request()
          .input('eventoId', evento.sqlEventoId)
          .query(`
            SELECT integrante_externo_id, tipo_participante, asistencia
            FROM evento_integrantes_externos
            WHERE evento_id = @eventoId
          `);

        for (const participante of participantesResult.recordset) {
          const existeCheck = await transaction.request()
            .input('megaEventoId', megaEvento.sqlMegaEventoId)
            .input('integranteId', participante.integrante_externo_id)
            .query(`
              SELECT 1 FROM mega_evento_participantes_externos 
              WHERE mega_evento_id = @megaEventoId AND integrante_externo_id = @integranteId
            `);

          if (existeCheck.recordset.length === 0) {
            await transaction.request()
              .input('megaEventoId', megaEvento.sqlMegaEventoId)
              .input('integranteId', participante.integrante_externo_id)
              .input('tipoParticipacion', participante.tipo_participante || 'participante')
              .query(`
                INSERT INTO mega_evento_participantes_externos 
                (mega_evento_id, integrante_externo_id, tipo_participacion, fecha_registro)
                VALUES (@megaEventoId, @integranteId, @tipoParticipacion, GETDATE())
              `);
            totalParticipantesAbsorbidos++;
          }
        }

        const patrocinadoresResult = await pool.request()
          .input('eventoId', evento.sqlEventoId)
          .query(`
            SELECT empresa_id FROM evento_patrocinadores WHERE evento_id = @eventoId
          `);

        for (const patrocinador of patrocinadoresResult.recordset) {
          const existeCheck = await transaction.request()
            .input('megaEventoId', megaEvento.sqlMegaEventoId)
            .input('empresaId', patrocinador.empresa_id)
            .query(`
              SELECT 1 FROM mega_evento_patrocinadores 
              WHERE mega_evento_id = @megaEventoId AND empresa_id = @empresaId
            `);

          if (existeCheck.recordset.length === 0) {
            await transaction.request()
              .input('megaEventoId', megaEvento.sqlMegaEventoId)
              .input('empresaId', patrocinador.empresa_id)
              .input('tipoPatrocinio', 'patrocinador')
              .query(`
                INSERT INTO mega_evento_patrocinadores 
                (mega_evento_id, empresa_id, tipo_patrocinio)
                VALUES (@megaEventoId, @empresaId, @tipoPatrocinio)
              `);
            if (!megaEvento.empresasPatrocinadoras.includes(patrocinador.empresa_id)) {
              megaEvento.empresasPatrocinadoras.push(patrocinador.empresa_id);
              totalEmpresasAbsorbidas++;
            }
          }
        }

        const auspiciadoresResult = await pool.request()
          .input('eventoId', evento.sqlEventoId)
          .query(`
            SELECT empresa_id FROM evento_Auspisiadores WHERE evento_id = @eventoId
          `);

        for (const auspiciador of auspiciadoresResult.recordset) {
          const existeCheck = await transaction.request()
            .input('megaEventoId', megaEvento.sqlMegaEventoId)
            .input('empresaId', auspiciador.empresa_id)
            .query(`
              SELECT 1 FROM mega_evento_patrocinadores 
              WHERE mega_evento_id = @megaEventoId AND empresa_id = @empresaId
            `);

          if (existeCheck.recordset.length === 0) {
            await transaction.request()
              .input('megaEventoId', megaEvento.sqlMegaEventoId)
              .input('empresaId', auspiciador.empresa_id)
              .input('tipoPatrocinio', 'auspiciador')
              .query(`
                INSERT INTO mega_evento_patrocinadores 
                (mega_evento_id, empresa_id, tipo_patrocinio)
                VALUES (@megaEventoId, @empresaId, @tipoPatrocinio)
              `);
            if (!megaEvento.empresasAuspiciadoras.includes(auspiciador.empresa_id)) {
              megaEvento.empresasAuspiciadoras.push(auspiciador.empresa_id);
              totalEmpresasAbsorbidas++;
            }
          }
        }

        evento.estado = 'absorbido';
        evento.megaEventoId = megaEvento.sqlMegaEventoId;
        evento.fechaInicio = megaEvento.fechaInicio;
        evento.fechaFinal = megaEvento.fechaFin;
        evento.publico = false;

        if (evento.fechaLimiteInscripcion && evento.fechaLimiteInscripcion > evento.fechaInicio) {
          evento.fechaLimiteInscripcion = new Date(evento.fechaInicio.getTime() - 24 * 60 * 60 * 1000); // Un día antes
        }

        await evento.save();

        eventosAbsorbidosInfo.push({
          id: evento._id,
          titulo: evento.titulo,
          sqlEventoId: evento.sqlEventoId,
          participantes: participantesResult.recordset.length,
          patrocinadores: patrocinadoresResult.recordset.length,
          auspiciadores: auspiciadoresResult.recordset.length
        });
      }

      megaEvento.eventosAbsorbidos.push(...eventosIds);
      megaEvento.metricas.totalEventosAbsorbidos += eventos.length;
      megaEvento.metricas.totalInscritos += totalParticipantesAbsorbidos;
      megaEvento.metricas.totalPatrocinadores = megaEvento.empresasPatrocinadoras.length + megaEvento.empresasAuspiciadoras.length;

      await megaEvento.save();
      await transaction.commit();

      res.json({
        success: true,
        message: `${eventos.length} eventos absorbidos exitosamente`,
        resumen: {
          eventosAbsorbidos: eventos.length,
          participantesAbsorbidos: totalParticipantesAbsorbidos,
          empresasAbsorbidas: totalEmpresasAbsorbidas,
          megaEventoId: megaEvento._id
        },
        detalleEventos: eventosAbsorbidosInfo
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('💥 Error absorbiendo eventos:', error);

    // Mongoose ValidationError (por ejemplo, fechas inválidas)
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: error.message || 'Error de validación al guardar el evento'
      });
    }

    // Errores personalizados o de lógica
    if (typeof error.message === 'string') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Otro tipo de error (no controlado)
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al absorber eventos'
    });
  }
};

const getMegaEventWithAbsorbedEvents = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    
    const megaEvento = await MegaEvento.findById(megaEventoId).lean();
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({ 
        success: false, 
        error: 'Mega evento no encontrado' 
      });
    }

    const eventosAbsorbidos = await Evento.find({
      megaEventoId: megaEvento.sqlMegaEventoId,
      estado: 'absorbido',
      activo: true
    }).lean();

    if (megaEvento.imagenesPromocionales && megaEvento.imagenesPromocionales.length > 0) {
      megaEvento.imagenPrincipal = {
        url: `data:${megaEvento.imagenesPromocionales[0].mimeType};base64,${megaEvento.imagenesPromocionales[0].datos.toString('base64')}`
      };

      megaEvento.imagenesPromocionales = megaEvento.imagenesPromocionales.map(img => ({
        _id: img._id,
        nombre: img.nombre,
        descripcion: img.descripcion,
        tipo: img.tipo,
        url: `data:${img.mimeType};base64,${img.datos.toString('base64')}`
      }));
    }

    const eventosConImagenes = eventosAbsorbidos.map(evento => {
      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        evento.imagenPrincipal = {
          url: `data:${evento.imagenesPromocionales[0].mimeType};base64,${evento.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;
      return evento;
    });

    const pool = await poolPromise;

    const empresasResult = await pool.request()
      .input('MegaEventoID', megaEvento.sqlMegaEventoId)
      .query(`
        SELECT 
          e.id_usuario AS empresaId,
          e.nombre_empresa, 
          u.nombre_usuario, 
          u.correo_electronico,
          mep.tipo_patrocinio
        FROM mega_evento_patrocinadores mep
        INNER JOIN empresas e ON mep.empresa_id = e.id_usuario
        INNER JOIN usuarios u ON e.id_usuario = u.id_usuario
        WHERE mep.mega_evento_id = @MegaEventoID AND mep.activo = 1
      `);

    const empresasPatrocinadoras = empresasResult.recordset.filter(e => e.tipo_patrocinio === 'patrocinador');
    const empresasAuspiciadoras = empresasResult.recordset.filter(e => e.tipo_patrocinio === 'auspiciador');

    // Participantes externos (sin filtrar por 'activo')
    const participantesResult = await pool.request()
      .input('MegaEventoID', megaEvento.sqlMegaEventoId)
      .query(`
        SELECT 
          ie.nombres,
          ie.apellidos,
          ie.Email,
          mep.tipo_participacion,
          mep.fecha_registro,
          mep.comentarios,
          mep.asistencia
        FROM mega_evento_participantes_externos mep
        INNER JOIN integrantes_externos ie 
          ON mep.integrante_externo_id = ie.id_usuario
        WHERE mep.mega_evento_id = @MegaEventoID
      `);


    megaEvento.eventosAbsorbidos = eventosConImagenes;
    megaEvento.empresasPatrocinadoras = empresasPatrocinadoras;
    megaEvento.empresasAuspiciadoras = empresasAuspiciadoras;
    megaEvento.participantes = participantesResult.recordset;

    res.json({ 
      success: true, 
      megaEvento,
      estadisticas: {
        totalEventosAbsorbidos: eventosConImagenes.length,
        totalPatrocinadores: empresasPatrocinadoras.length,
        totalAuspiciadores: empresasAuspiciadoras.length,
        totalParticipantes: participantesResult.recordset.length
      }
    });

  } catch (error) {
    console.error('Error obteniendo mega evento con eventos absorbidos:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al obtener mega evento' 
    });
  }
};

const releaseAbsorbedEvents = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { eventosIds, ongId } = req.body;

    console.log('🔄 Liberando eventos absorbidos:', { megaEventoId, eventosIds });

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    if (megaEvento.ongOrganizadoraPrincipal !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para liberar eventos de este mega evento'
      });
    }

    if (megaEvento.estado === 'finalizado') {
      return res.status(400).json({
        success: false,
        error: 'No se pueden liberar eventos de un mega evento finalizado'
      });
    }

    const eventos = await Evento.find({
      _id: { $in: eventosIds },
      megaEventoId: megaEvento.sqlMegaEventoId,
      estado: 'absorbido'
    });

    if (eventos.length !== eventosIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Algunos eventos no pertenecen a este mega evento'
      });
    }

    const pool = await poolPromise;
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      for (const evento of eventos) {
        evento.estado = 'publicado';
        evento.megaEventoId = undefined;
        evento.publico = true;
        await evento.save();
      }

      megaEvento.eventosAbsorbidos = megaEvento.eventosAbsorbidos.filter(
        id => !eventosIds.includes(id.toString())
      );
      megaEvento.metricas.totalEventosAbsorbidos = megaEvento.eventosAbsorbidos.length;
      await megaEvento.save();

      await transaction.commit();

      res.json({
        success: true,
        message: `${eventos.length} eventos liberados exitosamente`,
        eventosLiberados: eventos.map(e => ({
          id: e._id,
          titulo: e.titulo,
          estado: e.estado
        }))
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('💥 Error liberando eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al liberar eventos'
    });
  }
};

const getAllMegaEvents = async (req, res) => {
  try {
    const { categoria, ciudad, estado = 'convocatoria', pagina = 1, limite = 10 } = req.query;

    const filtros = { 
      estado: { $in: ['convocatoria', 'organizacion'] }, 
      esPublico: true, 
      activo: true,
      fechaInicio: { $gte: new Date() }
    };
    
    if (categoria) filtros.categoria = categoria;
    if (ciudad) filtros['ubicacion.ciudad'] = ciudad;
    if (estado && estado !== 'todos') filtros.estado = estado;

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const megaEventos = await MegaEvento.find(filtros)
      .sort({ fechaInicio: 1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

    const total = await MegaEvento.countDocuments(filtros);

    const megaEventosEnriquecidos = await Promise.all(megaEventos.map(async (megaEvento) => {
      const eventosAbsorbidos = await Evento.countDocuments({
        megaEventoId: megaEvento.sqlMegaEventoId,
        estado: 'absorbido',
        activo: true
      });

      if (megaEvento.imagenesPromocionales && megaEvento.imagenesPromocionales.length > 0) {
        const imagenPrincipal = megaEvento.imagenesPromocionales[0];
        megaEvento.imagenPrincipal = {
          url: `data:${imagenPrincipal.mimeType};base64,${imagenPrincipal.datos.toString('base64')}`
        };
      }
      delete megaEvento.imagenesPromocionales;

      return {
        ...megaEvento,
        totalEventosAbsorbidos: eventosAbsorbidos,
        resumen: `${eventosAbsorbidos} eventos incluidos`
      };
    }));

    res.json({
      success: true,
      megaEventos: megaEventosEnriquecidos,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error obteniendo mega eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mega eventos'
    });
  }
};

const changeMegaEventStatus = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { nuevoEstado, ongId, motivo } = req.body;

    if (!Object.values(ESTADOS_MEGA_EVENTO).includes(nuevoEstado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido',
        estadosValidos: Object.values(ESTADOS_MEGA_EVENTO)
      });
    }

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    if (megaEvento.ongOrganizadoraPrincipal !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para cambiar el estado de este mega evento'
      });
    }

    if (nuevoEstado === 'convocatoria') {
      if (megaEvento.eventosAbsorbidos.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Debe absorber al menos un evento antes de abrir la convocatoria'
        });
      }
      megaEvento.esPublico = true;
    }

    await megaEvento.cambiarEstado(nuevoEstado, parseInt(ongId), motivo);

    const pool = await poolPromise;
    await pool.request()
      .input('MegaEventoID', megaEvento.sqlMegaEventoId)
      .input('estado', nuevoEstado)
      .input('es_publico', megaEvento.esPublico ? 1 : 0)
      .query(`
        UPDATE mega_eventos 
        SET estado = @estado, es_publico = @es_publico 
        WHERE MegaEventoID = @MegaEventoID
      `);

    res.json({
      success: true,
      message: `Estado cambiado a "${nuevoEstado}" exitosamente`,
      megaEvento: {
        id: megaEvento._id,
        titulo: megaEvento.titulo,
        estadoActual: nuevoEstado,
        esPublico: megaEvento.esPublico,
        totalEventosAbsorbidos: megaEvento.eventosAbsorbidos.length
      }
    });

  } catch (error) {
    console.error('Error cambiando estado:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al cambiar estado del mega evento'
    });
  }
};

const registerMegaEventParticipant = async (req, res) => {
  const { megaEventoId } = req.params;
  const { tipoParticipacion = 'participante' } = req.body;
  const integranteId = req.body.integranteId; // inyectado por middleware

  // 1) Validar tipo de participación
  const tiposValidos = ['participante', 'voluntario', 'ponente', 'facilitador'];
  if (!tiposValidos.includes(tipoParticipacion)) {
    return res.status(400).json({
      success: false,
      error: `Tipo de participación debe ser uno de: ${tiposValidos.join(', ')}`
    });
  }

  // 2) Traer mega-evento y validar existencia/activo
  const megaEvento = await MegaEvento.findById(megaEventoId);
  if (!megaEvento || !megaEvento.activo) {
    return res.status(404).json({
      success: false,
      error: 'Mega evento no encontrado'
    });
  }

  // ————— Normalizar el array en caso de documentos antiguos —————
  if (!Array.isArray(megaEvento.participantesExternos)) {
    megaEvento.participantesExternos = [];
  }

  // 3) Estado y visibilidad
  if (!megaEvento.esPublico || !['convocatoria','organizacion'].includes(megaEvento.estado)) {
    return res.status(400).json({
      success: false,
      error: 'El mega evento no está disponible para nuevas inscripciones'
    });
  }

  // 4) Validar fecha límite (si existe)
  const ahora = new Date();
  if (megaEvento.fechaLimiteInscripcion && ahora > megaEvento.fechaLimiteInscripcion) {
    return res.status(400).json({
      success: false,
      error: 'Se ha vencido la fecha límite de inscripción'
    });
  }

  // 5) Iniciar transacción en SQL Server
  const pool = await poolPromise;
  const transaction = pool.transaction();
  await transaction.begin();

  try {
    // 6) Verificar capacidad en SQL
    if (megaEvento.capacidadMaxima) {
      const result = await transaction.request()
        .input('megaId', megaEvento.sqlMegaEventoId)
        .query(`
          SELECT COUNT(*) AS total
          FROM mega_evento_participantes_externos
          WHERE mega_evento_id = @megaId
        `);
      if (result.recordset[0].total >= megaEvento.capacidadMaxima) {
        throw new Error('Se ha alcanzado la capacidad máxima del mega evento');
      }
    }

    // 7) Verificar duplicado en SQL
    const dup = await transaction.request()
      .input('megaId', megaEvento.sqlMegaEventoId)
      .input('inteId', integranteId)
      .query(`
        SELECT 1
        FROM mega_evento_participantes_externos
        WHERE mega_evento_id = @megaId
          AND integrante_externo_id = @inteId
      `);
    if (dup.recordset.length > 0) {
      throw new Error('Ya estás registrado en este mega evento');
    }

    // 8) Insertar en SQL
    await transaction.request()
      .input('megaId', megaEvento.sqlMegaEventoId)
      .input('inteId', integranteId)
      .input('tipoPart', tipoParticipacion)
      .query(`
        INSERT INTO mega_evento_participantes_externos
          (mega_evento_id, integrante_externo_id, tipo_participacion, fecha_registro)
        VALUES
          (@megaId, @inteId, @tipoPart, GETDATE())
      `);

    // 9) Empujar en el array de Mongo
    const estadoParticipacion = megaEvento.requiereAprobacion
      ? 'en_espera'
      : 'confirmado';

    megaEvento.participantesExternos.push({
      integranteId: parseInt(integranteId, 10),
      tipoParticipacion,
      estadoParticipacion,
      fechaRegistro: new Date()
    });

    await megaEvento.save();  // si falla, iremos al catch y haremos rollback

    // 10) Commit en SQL
    await transaction.commit();

    // 11) Responder
    return res.json({
      success: true,
      message: `Registrado como ${tipoParticipacion} exitosamente`,
      megaEvento: {
        id: megaEvento._id,
        titulo: megaEvento.titulo,
        totalParticipantes: megaEvento.metricas.totalInscritos
      }
    });

  } catch (err) {
    // Rollback y respuesta de error
    await transaction.rollback();
    console.error('Error registrando participante en mega evento:', err);
    // Mapear mensajes a códigos apropiados
    const status = err.message.includes('Ya estás registrado')   ? 409 :
                   err.message.includes('capacidad máxima')      ? 400 :
                   err.message.includes('fecha límite')         ? 400 :
                   500;
    return res.status(status).json({ success: false, error: err.message });
  }
};



const getMegaEventStatistics = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { ongId } = req.query;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    if (megaEvento.ongOrganizadoraPrincipal !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver estadísticas de este mega evento'
      });
    }

    const pool = await poolPromise;

    const eventosAbsorbidos = await Evento.find({
      megaEventoId: megaEvento.sqlMegaEventoId,
      estado: 'absorbido',
      activo: true
    }).select('titulo tipoEvento ongId fechaInicio').lean();

    const participacionStats = await pool.request()
      .input('megaEventoId', megaEvento.sqlMegaEventoId)
      .query(`
        SELECT 
          tipo_participacion,
          COUNT(*) as total
        FROM mega_evento_participantes_externos 
        WHERE mega_evento_id = @megaEventoId AND activo = 1
        GROUP BY tipo_participacion
      `);

    const empresasStats = await pool.request()
      .input('megaEventoId', megaEvento.sqlMegaEventoId)
      .query(`
        SELECT 
          tipo_patrocinio,
          COUNT(*) as total,
          SUM(ISNULL(monto_contribucion, 0)) as totalMonto
        FROM mega_evento_patrocinadores 
        WHERE mega_evento_id = @megaEventoId AND activo = 1
        GROUP BY tipo_patrocinio
      `);

    const tiposEventos = eventosAbsorbidos.reduce((acc, evento) => {
      acc[evento.tipoEvento] = (acc[evento.tipoEvento] || 0) + 1;
      return acc;
    }, {});

    const estadisticas = {
      megaEvento: {
        id: megaEvento._id,
        titulo: megaEvento.titulo,
        estado: megaEvento.estado,
        fechaInicio: megaEvento.fechaInicio,
        fechaFin: megaEvento.fechaFin
      },
      eventosAbsorbidos: {
        total: eventosAbsorbidos.length,
        porTipo: tiposEventos,
        lista: eventosAbsorbidos
      },
      participacion: {
        totalParticipantes: megaEvento.metricas.totalInscritos,
        participantesPorTipo: participacionStats.recordset.reduce((acc, row) => {
          acc[row.tipo_participacion] = row.total;
          return acc;
        }, {}),
        capacidadMaxima: megaEvento.capacidadMaxima,
        espaciosDisponibles: megaEvento.capacidadMaxima ? 
          megaEvento.capacidadMaxima - megaEvento.metricas.totalInscritos : null
      },
      empresas: {
        totalEmpresas: megaEvento.metricas.totalPatrocinadores,
        empresasPorTipo: empresasStats.recordset.reduce((acc, row) => {
          acc[row.tipo_patrocinio] = {
            total: row.total,
            montoTotal: row.totalMonto || 0
          };
          return acc;
        }, {}),
        montoTotalRecaudado: empresasStats.recordset.reduce((sum, row) => 
          sum + (row.totalMonto || 0), 0)
      },
      contenido: {
        totalImagenes: megaEvento.imagenesPromocionales.length,
        totalTags: megaEvento.tags.length
      }
    };

    res.json({
      success: true,
      estadisticas
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
};

const searchMegaEvents = async (req, res) => {
  try {
    const { termino } = req.params;
    const { categoria, ciudad, fechaDesde, fechaHasta, limite = 20 } = req.query;
    
    console.log(`🔍 Búsqueda de mega eventos: "${termino}"`);
    
    const query = {
      activo: true,
      esPublico: true,
      estado: { $in: ['convocatoria', 'organizacion'] },
      $or: [
        { titulo: { $regex: termino, $options: 'i' } },
        { descripcion: { $regex: termino, $options: 'i' } },
        { tags: { $in: [new RegExp(termino, 'i')] } }
      ]
    };
    
    if (categoria) query.categoria = categoria;
    if (ciudad) query['ubicacion.ciudad'] = ciudad;
    if (fechaDesde || fechaHasta) {
      query.fechaInicio = {};
      if (fechaDesde) query.fechaInicio.$gte = new Date(fechaDesde);
      if (fechaHasta) query.fechaInicio.$lte = new Date(fechaHasta);
    }
    
    const megaEventos = await MegaEvento.find(query)
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();

    const megaEventosEnriquecidos = await Promise.all(megaEventos.map(async (megaEvento) => {
      const eventosAbsorbidos = await Evento.countDocuments({
        megaEventoId: megaEvento.sqlMegaEventoId,
        estado: 'absorbido',
        activo: true
      });

      if (megaEvento.imagenesPromocionales && megaEvento.imagenesPromocionales.length > 0) {
        megaEvento.imagenPrincipal = {
          url: `data:${megaEvento.imagenesPromocionales[0].mimeType};base64,${megaEvento.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete megaEvento.imagenesPromocionales;

      return {
        ...megaEvento,
        totalEventosAbsorbidos: eventosAbsorbidos
      };
    }));
    
    res.json({
      success: true,
      termino,
      megaEventos: megaEventosEnriquecidos,
      total: megaEventosEnriquecidos.length,
      filtrosAplicados: { categoria, ciudad, fechaDesde, fechaHasta }
    });
  } catch (error) {
    console.error('Error buscando mega eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error en la búsqueda de mega eventos'
    });
  }
};

const getOngMegaEvents = async (req, res) => {
  try {
    const { ongId } = req.params;
    const { estado, pagina = 1, limite = 10 } = req.query;

    const filtros = { 
      ongOrganizadoraPrincipal: parseInt(ongId),
      activo: true 
    };
    
    if (estado) filtros.estado = estado;

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const megaEventos = await MegaEvento.find(filtros)
      .sort({ fechaInicio: -1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

    const total = await MegaEvento.countDocuments(filtros);

    const megaEventosEnriquecidos = await Promise.all(megaEventos.map(async (megaEvento) => {
      const eventosAbsorbidos = await Evento.countDocuments({
        megaEventoId: megaEvento.sqlMegaEventoId,
        estado: 'absorbido',
        activo: true
      });

      if (megaEvento.imagenesPromocionales && megaEvento.imagenesPromocionales.length > 0) {
        const imagenPrincipal = megaEvento.imagenesPromocionales[0];
        megaEvento.imagenPrincipal = {
          url: `data:${imagenPrincipal.mimeType};base64,${imagenPrincipal.datos.toString('base64')}`
        };
      }
      delete megaEvento.imagenesPromocionales;

      return {
        ...megaEvento,
        totalEventosAbsorbidos: eventosAbsorbidos
      };
    }));

    res.json({
      success: true,
      megaEventos: megaEventosEnriquecidos,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error obteniendo mega eventos de ONG:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mega eventos'
    });
  }
};

const updateMegaEvent = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { ongId } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    if (megaEvento.ongOrganizadoraPrincipal !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para editar este mega evento'
      });
    }

    if (['finalizado', 'cancelado'].includes(megaEvento.estado)) {
      return res.status(400).json({
        success: false,
        error: 'No se puede editar un mega evento finalizado o cancelado'
      });
    }

    const camposPermitidos = [
      'titulo', 'descripcion', 'fechaInicio', 'fechaFin', 
      'ubicacion', 'categoria', 'capacidadMaxima', 
      'inscripcionAbierta', 'fechaLimiteInscripcion', 'tags',
      'objetivos', 'resultadosEsperados', 'contactoInfo'
    ];

    let huboCambios = false;

    camposPermitidos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        if (['fechaInicio', 'fechaFin', 'fechaLimiteInscripcion'].includes(campo)) {
          megaEvento[campo] = req.body[campo] ? new Date(req.body[campo]) : null;
        } else if (campo === 'ubicacion') {
          if (typeof req.body[campo] === 'string') {
            megaEvento.ubicacion.direccion = req.body[campo];
          } else {
            megaEvento.ubicacion = { ...megaEvento.ubicacion, ...req.body[campo] };
          }
        } else if (['tags', 'objetivos', 'resultadosEsperados'].includes(campo)) {
          megaEvento[campo] = Array.isArray(req.body[campo]) ? 
            req.body[campo] : JSON.parse(req.body[campo] || '[]');
        } else {
          megaEvento[campo] = req.body[campo];
        }
        huboCambios = true;
      }
    });

    if (req.files && req.files.length > 0) {
      if (megaEvento.imagenesPromocionales.length + req.files.length > 10) {
        return res.status(400).json({
          success: false,
          error: 'Máximo 10 imágenes por mega evento'
        });
      }

      const nuevasImagenes = await processImages(req.files);
      megaEvento.imagenesPromocionales.push(...nuevasImagenes);
      huboCambios = true;
    }

    if (!huboCambios) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron cambios para actualizar'
      });
    }

    await megaEvento.save();

    if (megaEvento.sqlMegaEventoId) {
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('MegaEventoID', megaEvento.sqlMegaEventoId)
          .input('titulo', megaEvento.titulo)
          .input('descripcion', megaEvento.descripcion)
          .input('fecha_inicio', megaEvento.fechaInicio)
          .input('fecha_fin', megaEvento.fechaFin)
          .input('ubicacion', megaEvento.ubicacion.direccion)
          .input('categoria', megaEvento.categoria)
          .query(`
            UPDATE mega_eventos 
            SET titulo = @titulo, descripcion = @descripcion, 
                fecha_inicio = @fecha_inicio, fecha_fin = @fecha_fin, 
                ubicacion = @ubicacion, categoria = @categoria
            WHERE MegaEventoID = @MegaEventoID
          `);
      } catch (sqlError) {
        console.error('Error sincronizando con SQL Server:', sqlError);
      }
    }

    res.json({
      success: true,
      message: 'Mega evento actualizado exitosamente',
      megaEvento: {
        id: megaEvento._id,
        titulo: megaEvento.titulo,
        estado: megaEvento.estado,
        totalImagenes: megaEvento.imagenesPromocionales.length,
        totalEventosAbsorbidos: megaEvento.eventosAbsorbidos.length
      }
    });

  } catch (error) {
    console.error('Error actualizando mega evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar mega evento'
    });
  }
};

const deleteMegaEvent = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { ongId } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    if (megaEvento.ongOrganizadoraPrincipal !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para eliminar este mega evento'
      });
    }

    if (megaEvento.participantesExternos.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar un mega evento con participantes registrados',
        sugerencia: 'Use el estado "cancelado" para cancelar el mega evento'
      });
    }

    if (megaEvento.eventosAbsorbidos.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe liberar todos los eventos absorbidos antes de eliminar el mega evento'
      });
    }

    const pool = await poolPromise;
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      await transaction.request()
        .input('mega_evento_id', megaEvento.sqlMegaEventoId)
        .query('DELETE FROM mega_evento_patrocinadores WHERE mega_evento_id = @mega_evento_id');

      await transaction.request()
        .input('mega_evento_id', megaEvento.sqlMegaEventoId)
        .query('DELETE FROM mega_evento_participantes_externos WHERE mega_evento_id = @mega_evento_id');

      await transaction.request()
        .input('MegaEventoID', megaEvento.sqlMegaEventoId)
        .query('DELETE FROM mega_eventos WHERE MegaEventoID = @MegaEventoID');

      await transaction.commit();
    } catch (sqlError) {
      await transaction.rollback();
      console.error('Error eliminando de SQL Server:', sqlError);
    }

    megaEvento.activo = false;
    megaEvento.estado = 'cancelado';
    await megaEvento.save();

    res.json({
      success: true,
      message: 'Mega evento eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando mega evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar mega evento'
    });
  }
};

const deleteMegaEventImage = async (req, res) => {
  try {
    const { megaEventoId, imagenId } = req.params;
    const { ongId } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    if (megaEvento.ongOrganizadoraPrincipal !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para eliminar imágenes de este mega evento'
      });
    }

    const imagenIndex = megaEvento.imagenesPromocionales.findIndex(
      img => img._id.toString() === imagenId
    );

    if (imagenIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Imagen no encontrada'
      });
    }

    megaEvento.imagenesPromocionales.splice(imagenIndex, 1);
    await megaEvento.save();

    res.json({
      success: true,
      message: 'Imagen eliminada exitosamente',
      totalImagenes: megaEvento.imagenesPromocionales.length
    });

  } catch (error) {
    console.error('Error eliminando imagen:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar imagen'
    });
  }
};

const addCollaboratingONG = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { ongColaboradoraId, rolOrganizacion = 'colaborador' } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    if (megaEvento.ongOrganizadoraPrincipal !== req.user.sqlUserId) {
      return res.status(403).json({
        success: false,
        error: 'Solo la ONG organizadora principal puede agregar colaboradores'
      });
    }

    if (!['convocatoria', 'organizacion'].includes(megaEvento.estado)) {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden agregar colaboradores en estado de convocatoria u organización'
      });
    }

    const pool = await poolPromise;
    const ongCheck = await pool.request()
      .input('ongId', ongColaboradoraId)
      .query(`
        SELECT nombre_ong FROM ongs o
        INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
        WHERE o.id_usuario = @ongId AND u.activo = 1
      `);

    if (ongCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ONG colaboradora no encontrada'
      });
    }

    const existeCheck = await pool.request()
      .input('mega_evento_id', megaEvento.sqlMegaEventoId)
      .input('ong_id', ongColaboradoraId)
      .query(`
        SELECT 1 FROM mega_evento_ongs_organizadoras 
        WHERE mega_evento_id = @mega_evento_id AND ong_id = @ong_id AND activo = 1
      `);

    if (existeCheck.recordset.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'La ONG ya está registrada como colaboradora'
      });
    }

    await pool.request()
      .input('mega_evento_id', megaEvento.sqlMegaEventoId)
      .input('ong_id', ongColaboradoraId)
      .input('rol_organizacion', rolOrganizacion)
      .query(`
        INSERT INTO mega_evento_ongs_organizadoras (mega_evento_id, ong_id, rol_organizacion)
        VALUES (@mega_evento_id, @ong_id, @rol_organizacion)
      `);

    megaEvento.metricas.totalOngsParticipantes = (megaEvento.metricas.totalOngsParticipantes || 0) + 1;
    await megaEvento.save();

    res.json({
      success: true,
      message: 'ONG colaboradora agregada exitosamente',
      colaborador: {
        ongId: ongColaboradoraId,
        nombreOng: ongCheck.recordset[0].nombre_ong,
        rol: rolOrganizacion
      }
    });

  } catch (error) {
    console.error('Error agregando ONG colaboradora:', error);
    res.status(500).json({
      success: false,
      error: 'Error al agregar ONG colaboradora'
    });
  }
};

const registerMassAttendance = async (req, res) => {
  try {
    const { megaEventoId } = req.params;
    const { asistencias } = req.body;

    const megaEvento = await MegaEvento.findById(megaEventoId);
    if (!megaEvento || !megaEvento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
      });
    }

    if (megaEvento.ongOrganizadoraPrincipal !== req.user.sqlUserId) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para registrar asistencia en este mega evento'
      });
    }

    if (!Array.isArray(asistencias) || asistencias.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar un array de asistencias'
      });
    }

    let procesados = 0;
    let errores = [];

    for (const asistencia of asistencias) {
      try {
        await megaEvento.registrarAsistencia(asistencia.integranteId, asistencia.asistencia);
        procesados++;
      } catch (error) {
        errores.push({
          integranteId: asistencia.integranteId,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `${procesados} asistencias registradas exitosamente`,
      procesados,
      errores: errores.length,
      detalleErrores: errores,
      metricas: {
        totalAsistentes: megaEvento.metricas.totalAsistentes,
        porcentajeAsistencia: megaEvento.metricas.porcentajeAsistencia
      }
    });

  } catch (error) {
    console.error('Error registrando asistencia masiva:', error);
    res.status(500).json({
      success: false,
      error: 'Error al registrar asistencia masiva'
    });
  }
};

module.exports = {
  createMegaEvent,
  getAllMegaEvents,
  getMegaEventWithAbsorbedEvents,
  getOngMegaEvents,
  getEventsAvailableForAbsorption,
  absorbEvents,
  releaseAbsorbedEvents,
  registerMegaEventParticipant,
  changeMegaEventStatus,
  getMegaEventStatistics,
  searchMegaEvents,
  updateMegaEvent,
  deleteMegaEvent,
  deleteMegaEventImage,
  addCollaboratingONG,
  registerMassAttendance,
  upload,
  ESTADOS_MEGA_EVENTO,
  ESTADOS_EVENTOS_ABSORBIBLES
};