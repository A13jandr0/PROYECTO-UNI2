const express = require('express');
const router = express.Router();

const {
  createMegaEvent,//
  getAllMegaEvents,//
  getMegaEventWithAbsorbedEvents,//
  getOngMegaEvents,//
  getEventsAvailableForAbsorption,//
  absorbEvents,
  releaseAbsorbedEvents,//
  registerMegaEventParticipant,
  changeMegaEventStatus,
  getMegaEventStatistics,
  searchMegaEvents,
  updateMegaEvent,
  deleteMegaEvent,
  deleteMegaEventImage,
  registerMassAttendance,
  upload,
  ESTADOS_MEGA_EVENTO,
  ESTADOS_EVENTOS_ABSORBIBLES
} = require('../controllers/MegaEvento.controller');

const {
  authenticateToken,
  requireONG,
  requireEmpresa,
  requireIntegranteExterno,
  requireMegaEventOwner,
  validateParams,
  logActivity,
  validateOwnCompany,
  validateOwnONG,
  validateOwnIntegrante
} = require('../middleware/auth');

const {
  validateMegaEvent,
  validateExternalParticipant,
  validateCompanySponsorship,
  validateStatusChange,
  validatePagination,
  validateMongoId
} = require('../middleware/validation.ME');

router.get('/buscar/:termino', searchMegaEvents);

router.get('/estados', (req, res) => {
  res.json({
    success: true,
    estados: ESTADOS_MEGA_EVENTO,
    estadosEventosAbsorbibles: ESTADOS_EVENTOS_ABSORBIBLES
  });
});

router.get('/sistema/estadisticas',
  authenticateToken,
  logActivity('Ver estadísticas del sistema'),
  async (req, res) => {
    try {
      const MegaEvento = require('../models/MegaEvento.model');
      const estadisticas = await MegaEvento.estadisticasGenerales();
      
      res.json({
        success: true,
        estadisticas: estadisticas[0] || {
          totalMegaEventos: 0,
          megaEventosActivos: 0,
          totalEventosAbsorbidos: 0,
          totalParticipantes: 0,
          promedioSatisfaccion: 0
        },
        fecha: new Date()
      });
    } catch (error) {
      console.error('Error obteniendo estadísticas del sistema:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estadísticas del sistema'
      });
    }
  }
);

router.get('/eventos-disponibles/listar',
  authenticateToken,
  requireONG,
  getEventsAvailableForAbsorption
);

router.get('/utils/empresas-disponibles',
  authenticateToken,
  requireONG,
  async (req, res) => {
    try {
      const { poolPromise } = require('../config/db');
      const pool = await poolPromise;
      
      const result = await pool.request()
        .query(`
          SELECT 
            e.id_usuario AS empresaId,
            e.nombre_empresa,
            u.nombre_usuario,
            u.correo_electronico,
            e.descripcion,
            e.telefono,
            e.sitio_web
          FROM empresas e
          INNER JOIN usuarios u ON e.id_usuario = u.id_usuario
          WHERE u.activo = 1
          ORDER BY e.nombre_empresa
        `);

      res.json({
        success: true,
        empresas: result.recordset
      });

    } catch (error) {
      console.error('Error obteniendo empresas disponibles:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener empresas disponibles'
      });
    }
  }
);

router.get('/utils/ongs-disponibles',
  authenticateToken,
  requireONG,
  async (req, res) => {
    try {
      const { poolPromise } = require('../config/db');
      const pool = await poolPromise;
      
      const result = await pool.request()
        .input('currentOngId', req.user.sqlUserId)
        .query(`
          SELECT 
            o.id_usuario AS ongId,
            o.nombre_ong,
            u.nombre_usuario,
            u.correo_electronico,
            o.descripcion,
            o.telefono
          FROM onGs o
          INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
          WHERE u.activo = 1 AND o.id_usuario != @currentOngId
          ORDER BY o.nombre_ong
        `);

      res.json({
        success: true,
        ongs: result.recordset
      });

    } catch (error) {
      console.error('Error obteniendo ONGs disponibles:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener ONGs disponibles'
      });
    }
  }
);

router.get('/ong/:ongId/dashboard',
  authenticateToken,
  requireONG,
  validateOwnONG,
  async (req, res) => {
    try {
      const { ongId } = req.params;
      const MegaEvento = require('../models/MegaEvento.model');
      
      const megaEventosPorEstado = await MegaEvento.aggregate([
        { 
          $match: { 
            ongOrganizadoraPrincipal: parseInt(ongId),
            activo: true 
          }
        },
        {
          $group: {
            _id: '$estado',
            count: { $sum: 1 },
            ultimaActualizacion: { $max: '$updatedAt' }
          }
        }
      ]);

      const proximosMegaEventos = await MegaEvento.find({
        ongOrganizadoraPrincipal: parseInt(ongId),
        activo: true,
        fechaInicio: { $gte: new Date() }
      })
      .sort({ fechaInicio: 1 })
      .limit(5)
      .select('titulo fechaInicio estado metricas.totalEventosAbsorbidos');

      res.json({
        success: true,
        ongId: parseInt(ongId),
        dashboard: {
          megaEventosPorEstado,
          proximosMegaEventos,
          resumen: {
            total: megaEventosPorEstado.reduce((sum, item) => sum + item.count, 0),
            proximos: proximosMegaEventos.length
          }
        }
      });
    } catch (error) {
      console.error('Error obteniendo dashboard de ONG:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener dashboard de mega eventos'
      });
    }
  }
);

router.get('/ong/:ongId',
  authenticateToken,
  requireONG,
  validateOwnONG,
  validatePagination,
  getOngMegaEvents
);

router.get('/empresa/:empresaId',
  authenticateToken,
  requireEmpresa,
  validateOwnCompany,
  async (req, res) => {
    try {
      const { empresaId } = req.params;
      const { tipo = 'todos', limite = 10 } = req.query;

      const { poolPromise } = require('../config/db');
      const MegaEvento = require('../models/MegaEvento.model');
      
      const pool = await poolPromise;
      
      let querySQL = `
        SELECT 
          me.MegaEventoID,
          me.titulo,
          me.fecha_inicio,
          me.estado,
          mep.tipo_patrocinio
        FROM mega_evento_patrocinadores mep
        INNER JOIN mega_eventos me ON mep.mega_evento_id = me.MegaEventoID
        WHERE mep.empresa_id = @empresaId AND mep.activo = 1
      `;

      if (tipo !== 'todos') {
        querySQL += ` AND mep.tipo_patrocinio = @tipo`;
      }

      querySQL += ` ORDER BY me.fecha_inicio DESC`;

      const request = pool.request().input('empresaId', empresaId);
      if (tipo !== 'todos') {
        request.input('tipo', tipo);
      }

      const result = await request.query(querySQL);
      const sqlMegaEventoIds = result.recordset.map(r => r.MegaEventoID);
      
      if (sqlMegaEventoIds.length === 0) {
        return res.json({
          success: true,
          empresaId: parseInt(empresaId),
          megaEventos: [],
          total: 0,
          mensaje: 'La empresa no participa en ningún mega evento'
        });
      }

      const megaEventosCompletos = await MegaEvento.find({
        sqlMegaEventoId: { $in: sqlMegaEventoIds },
        activo: true
      })
      .limit(parseInt(limite))
      .lean();

      const megaEventosCombinados = megaEventosCompletos.map(megaEvento => {
        const sqlData = result.recordset.find(r => r.MegaEventoID === megaEvento.sqlMegaEventoId);
        
        if (megaEvento.imagenesPromocionales?.length > 0) {
          megaEvento.imagenPrincipal = {
            url: `data:${megaEvento.imagenesPromocionales[0].mimeType};base64,${megaEvento.imagenesPromocionales[0].datos.toString('base64')}`
          };
        }
        delete megaEvento.imagenesPromocionales;
        
        return {
          ...megaEvento,
          participacion: {
            tipoPatrocinio: sqlData.tipo_patrocinio
          }
        };
      });

      res.json({
        success: true,
        empresaId: parseInt(empresaId),
        tipoConsultado: tipo,
        megaEventos: megaEventosCombinados,
        total: megaEventosCombinados.length
      });

    } catch (error) {
      console.error('Error obteniendo mega eventos de empresa:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener mega eventos de la empresa'
      });
    }
  }
);

router.get('/integrante/:integranteId',
  authenticateToken,
  requireIntegranteExterno,
  validateOwnIntegrante,
  async (req, res) => {
    try {
      const { integranteId } = req.params;
      const { estado, conAsistencia, limite = 10 } = req.query;

      const { poolPromise } = require('../config/db');
      const MegaEvento = require('../models/MegaEvento.model');

      const pool = await poolPromise;
      
      let query = `
        SELECT 
          me.MegaEventoID,
          me.titulo,
          me.fecha_inicio,
          me.fecha_fin,
          me.estado,
          mep.tipo_participacion,
          mep.fecha_registro
        FROM mega_evento_participantes_externos mep
        INNER JOIN mega_eventos me ON mep.mega_evento_id = me.MegaEventoID
        WHERE mep.integrante_externo_id = @integranteId AND mep.activo = 1
        ORDER BY me.fecha_inicio DESC
      `;

      const result = await pool.request()
        .input('integranteId', integranteId)
        .query(query);

      const sqlRecordset = result.recordset;

      if (sqlRecordset.length === 0) {
        return res.json({
          success: true,
          integranteId: parseInt(integranteId),
          megaEventos: [],
          total: 0,
          mensaje: 'No estás registrado en ningún mega evento'
        });
      }

      const sqlMegaEventoIds = sqlRecordset.map(r => r.MegaEventoID);
      const filtrosMongo = { 
        sqlMegaEventoId: { $in: sqlMegaEventoIds },
        activo: true 
      };
      
      if (estado) {
        filtrosMongo.estado = estado;
      }

      const megaEventosCompletos = await MegaEvento.find(filtrosMongo)
        .limit(parseInt(limite))
        .lean();

      const megaEventosCombinados = megaEventosCompletos.map(megaEvento => {
        const filaSQL = sqlRecordset.find(r => r.MegaEventoID === megaEvento.sqlMegaEventoId);

        if (megaEvento.imagenesPromocionales?.length > 0) {
          megaEvento.imagenPrincipal = {
            url: `data:${megaEvento.imagenesPromocionales[0].mimeType};base64,${megaEvento.imagenesPromocionales[0].datos.toString('base64')}`
          };
        }
        delete megaEvento.imagenesPromocionales;

        return {
          ...megaEvento,
          miParticipacion: {
            tipoParticipacion: filaSQL.tipo_participacion,
            fechaRegistro: filaSQL.fecha_registro,
            fechaEvento: filaSQL.fecha_inicio,
            fechaFinal: filaSQL.fecha_fin
          }
        };
      });

      res.json({
        success: true,
        integranteId: parseInt(integranteId),
        megaEventos: megaEventosCombinados,
        total: megaEventosCombinados.length,
        filtros: { estado, conAsistencia }
      });

    } catch (error) {
      console.error('Error obteniendo mega eventos del integrante:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener mega eventos del integrante'
      });
    }
  }
);

router.post('/',
  authenticateToken,
  requireONG,
  upload.array('imagenes', 10),
  validateMegaEvent,
  validateOwnONG,
  logActivity('Crear mega evento'),
  createMegaEvent
);

router.get('/',
  validatePagination,
  getAllMegaEvents
);

router.put('/:megaEventoId',
  authenticateToken,
  requireONG,
  upload.array('imagenes', 10),
  validateMongoId('megaEventoId'),
  requireMegaEventOwner,
  validateMegaEvent,
  logActivity('Actualizar mega evento'),
  updateMegaEvent
);

router.delete('/:megaEventoId',
  authenticateToken,
  requireONG,
  validateMongoId('megaEventoId'),
  requireMegaEventOwner,
  logActivity('Eliminar mega evento'),
  deleteMegaEvent
);

router.get('/:megaEventoId/estadisticas',
  authenticateToken,
  requireONG,
  validateMongoId('megaEventoId'),
  requireMegaEventOwner,
  getMegaEventStatistics
);

router.get('/:megaEventoId/participantes',
  authenticateToken,
  requireONG,
  validateMongoId('megaEventoId'),
  requireMegaEventOwner,
  async (req, res) => {
    try {
      const { megaEventoId } = req.params;
      const megaEvento = req.megaEvento;

      const { poolPromise } = require('../config/db');
      const pool = await poolPromise;

      const participantesResult = await pool.request()
        .input('megaEventoId', megaEvento.sqlMegaEventoId)
        .query(`
          SELECT 
            ie.id_usuario,
            ie.nombres,
            ie.apellidos,
            ie.Email,
            mep.tipo_participacion,
            mep.fecha_registro,
            mep.activo
          FROM mega_evento_participantes_externos mep
          INNER JOIN integrantes_externos ie ON mep.integrante_externo_id = ie.id_usuario
          WHERE mep.mega_evento_id = @megaEventoId
          ORDER BY mep.fecha_registro DESC
        `);

      res.json({
        success: true,
        megaEventoId,
        participantes: participantesResult.recordset,
        total: participantesResult.recordset.length,
        resumen: {
          totalActivos: participantesResult.recordset.filter(p => p.activo).length,
          porTipo: participantesResult.recordset.reduce((acc, p) => {
            acc[p.tipo_participacion] = (acc[p.tipo_participacion] || 0) + 1;
            return acc;
          }, {})
        }
      });

    } catch (error) {
      console.error('Error obteniendo participantes:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener participantes'
      });
    }
  }
);

router.get('/:megaEventoId/transiciones',
  authenticateToken,
  requireONG,
  validateMongoId('megaEventoId'),
  requireMegaEventOwner,
  async (req, res) => {
    try {
      const megaEvento = req.megaEvento;

      const transicionesDisponibles = {
        'planificacion': ['convocatoria', 'cancelado'],
        'convocatoria': ['organizacion', 'cancelado'],
        'organizacion': ['en_curso', 'cancelado'],
        'en_curso': ['finalizado'],
        'finalizado': [],
        'cancelado': []
      };

      const transicionesActuales = transicionesDisponibles[megaEvento.estado] || [];
      
      const transicionesValidas = [];
      for (const nuevoEstado of transicionesActuales) {
        let esValida = true;
        let razon = 'Transición válida';

        if (nuevoEstado === 'convocatoria' && megaEvento.eventosAbsorbidos.length === 0) {
          esValida = false;
          razon = 'Debe absorber al menos un evento antes de abrir convocatoria';
        }

        if (nuevoEstado === 'en_curso') {
          const ahora = new Date();
          if (megaEvento.fechaInicio > ahora) {
            esValida = false;
            razon = 'No se puede iniciar antes de la fecha programada';
          }
        }

        transicionesValidas.push({
          estado: nuevoEstado,
          valida: esValida,
          razon
        });
      }

      res.json({
        success: true,
        megaEvento: {
          id: megaEvento._id,
          titulo: megaEvento.titulo,
          estadoActual: megaEvento.estado
        },
        transiciones: transicionesValidas,
        historial: megaEvento.historialEstados || []
      });

    } catch (error) {
      console.error('Error obteniendo transiciones:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener transiciones'
      });
    }
  }
);

router.post('/:megaEventoId/absorber-eventos',
  authenticateToken,
  requireONG,
  validateMongoId('megaEventoId'),
  requireMegaEventOwner,
  logActivity('Absorber eventos en mega evento'),
  absorbEvents
);

router.post('/:megaEventoId/liberar-eventos',
  authenticateToken,
  requireONG,
  validateMongoId('megaEventoId'),
  requireMegaEventOwner,
  logActivity('Liberar eventos de mega evento'),
  releaseAbsorbedEvents
);

router.put('/:megaEventoId/estado',
  authenticateToken,
  requireONG,
  validateMongoId('megaEventoId'),
  validateStatusChange,
  requireMegaEventOwner,
  logActivity('Cambiar estado de mega evento'),
  changeMegaEventStatus
);

router.post('/:megaEventoId/asistencia-masiva',
  authenticateToken,
  requireONG,
  validateMongoId('megaEventoId'),
  requireMegaEventOwner,
  logActivity('Registrar asistencia masiva'),
  registerMassAttendance
);

router.delete('/:megaEventoId/imagenes/:imagenId',
  authenticateToken,
  requireONG,
  validateMongoId('megaEventoId'),
  requireMegaEventOwner,
  logActivity('Eliminar imagen de mega evento'),
  deleteMegaEventImage
);

router.post('/:megaEventoId/empresa-patrocinador',
  authenticateToken,
  requireEmpresa,
  validateMongoId('megaEventoId'),
  validateCompanySponsorship,
  logActivity('Registrar empresa como patrocinadora'),
  (req, res, next) => {
    req.body.empresaId = req.user.sqlUserId;
    next();
  },
  async (req, res) => {
    try {
      const { megaEventoId } = req.params;
      const { empresaId, tipoPatrocinio = 'patrocinador', montoContribucion } = req.body;

      const MegaEvento = require('../models/MegaEvento.model');
      const { poolPromise } = require('../config/db');

      const megaEvento = await MegaEvento.findById(megaEventoId);
      if (!megaEvento || !megaEvento.activo) {
        return res.status(404).json({
          success: false,
          error: 'Mega evento no encontrado'
        });
      }

      if (!megaEvento.esPublico || !['convocatoria', 'organizacion'].includes(megaEvento.estado)) {
        return res.status(400).json({
          success: false,
          error: 'El mega evento no está disponible para nuevos patrocinios'
        });
      }

      const pool = await poolPromise;
      const existeCheck = await pool.request()
        .input('mega_evento_id', megaEvento.sqlMegaEventoId)
        .input('empresa_id', empresaId)
        .query(`
          SELECT 1 FROM mega_evento_patrocinadores 
          WHERE mega_evento_id = @mega_evento_id AND empresa_id = @empresa_id AND activo = 1
        `);

      if (existeCheck.recordset.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'La empresa ya está registrada como patrocinadora de este mega evento'
        });
      }

      await pool.request()
        .input('mega_evento_id', megaEvento.sqlMegaEventoId)
        .input('empresa_id', empresaId)
        .input('tipo_patrocinio', tipoPatrocinio)
        .input('monto_contribucion', montoContribucion || null)
        .query(`
          INSERT INTO mega_evento_patrocinadores (mega_evento_id, empresa_id, tipo_patrocinio, monto_contribucion)
          VALUES (@mega_evento_id, @empresa_id, @tipo_patrocinio, @monto_contribucion)
        `);

      if (tipoPatrocinio === 'patrocinador') {
        if (!megaEvento.empresasPatrocinadoras.includes(parseInt(empresaId))) {
          megaEvento.empresasPatrocinadoras.push(parseInt(empresaId));
        }
      } else {
        if (!megaEvento.empresasAuspiciadoras.includes(parseInt(empresaId))) {
          megaEvento.empresasAuspiciadoras.push(parseInt(empresaId));
        }
      }

      megaEvento.metricas.totalPatrocinadores = megaEvento.empresasPatrocinadoras.length + megaEvento.empresasAuspiciadoras.length;
      await megaEvento.save();

      res.json({
        success: true,
        message: `Empresa registrada como ${tipoPatrocinio} exitosamente`,
        megaEvento: {
          id: megaEvento._id,
          titulo: megaEvento.titulo,
          totalPatrocinadores: megaEvento.metricas.totalPatrocinadores
        }
      });

    } catch (error) {
      console.error('Error registrando empresa patrocinadora:', error);
      res.status(500).json({
        success: false,
        error: 'Error al registrar empresa como patrocinadora'
      });
    }
  }
);

router.post('/:megaEventoId/participantes',
  authenticateToken,
  requireIntegranteExterno,
  validateMongoId('megaEventoId'),
  validateExternalParticipant,
  logActivity('Registrar participante en mega evento'),
  (req, res, next) => {
    req.body.integranteId = req.user.sqlUserId;
    next();
  },
  registerMegaEventParticipant
);

router.get('/:megaEventoId',
  validateMongoId('megaEventoId'),
  getMegaEventWithAbsorbedEvents
);

module.exports = router;