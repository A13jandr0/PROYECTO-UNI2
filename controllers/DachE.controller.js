const { poolPromise } = require('../config/db');
const Evento = require('../models/evento.model');

// =================== DASHBOARD EVENTOS REGULARES ===================

// Dashboard principal con estadísticas generales
const getDashboardGeneral = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, ongId } = req.query;
    
    console.log('📊 Generando dashboard general de eventos...');
    
    // Filtros base para las consultas
    let filtrosFecha = {};
    if (fechaInicio || fechaFin) {
      filtrosFecha.fechaInicio = {};
      if (fechaInicio) filtrosFecha.fechaInicio.$gte = new Date(fechaInicio);
      if (fechaFin) filtrosFecha.fechaInicio.$lte = new Date(fechaFin);
    }
    
    let filtrosOng = {};
    if (ongId) filtrosOng.ongId = parseInt(ongId);

    const filtrosBase = { activo: true, ...filtrosFecha, ...filtrosOng };

    // 1. Estadísticas básicas de eventos
    const statsBasicas = await Evento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: null,
          totalEventos: { $sum: 1 },
          eventosPublicados: { $sum: { $cond: [{ $eq: ['$estado', 'publicado'] }, 1, 0] } },
          eventosFinalizados: { $sum: { $cond: [{ $eq: ['$estado', 'finalizado'] }, 1, 0] } },
          eventosEnCurso: { $sum: { $cond: [{ $eq: ['$estado', 'en_curso'] }, 1, 0] } },
          eventosCancelados: { $sum: { $cond: [{ $eq: ['$estado', 'cancelado'] }, 1, 0] } },
          totalParticipantesInscritos: { $sum: '$metricas.totalInscritos' },
          totalAsistentes: { $sum: '$metricas.totalAsistentes' },
          capacidadTotalOfrecida: { $sum: '$capacidadMaxima' },
          eventosSinLimiteCapacidad: { $sum: { $cond: [{ $eq: ['$capacidadMaxima', null] }, 1, 0] } }
        }
      }
    ]);

    // 2. Eventos por estado y tendencias
    const eventosPorEstado = await Evento.aggregate([
      { $match: filtrosBase },
      { $group: { _id: '$estado', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // 3. Eventos por tipo
    const eventosPorTipo = await Evento.aggregate([
      { $match: filtrosBase },
      { $group: { _id: '$tipoEvento', count: { $sum: 1 }, totalParticipantes: { $sum: '$metricas.totalInscritos' } } },
      { $sort: { count: -1 } }
    ]);

    // 4. Top ONGs más activas
    const topOngs = await Evento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: '$ongId',
          totalEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' }
        }
      },
      { $sort: { totalEventos: -1 } },
      { $limit: 10 }
    ]);

    // 5. Análisis temporal (eventos por mes)
    const eventosPorMes = await Evento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: {
            año: { $year: '$fechaInicio' },
            mes: { $month: '$fechaInicio' }
          },
          totalEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1 } }
    ]);

    // 6. Utilización de capacidad
    const utilizacionCapacidad = await Evento.aggregate([
      { $match: { ...filtrosBase, capacidadMaxima: { $ne: null, $gt: 0 } } },
      {
        $addFields: {
          porcentajeUtilizacion: {
            $multiply: [
              { $divide: ['$metricas.totalInscritos', '$capacidadMaxima'] },
              100
            ]
          }
        }
      },
      {
        $group: {
          _id: {
            rango: {
              $switch: {
                branches: [
                  { case: { $lt: ['$porcentajeUtilizacion', 25] }, then: '0-25%' },
                  { case: { $lt: ['$porcentajeUtilizacion', 50] }, then: '25-50%' },
                  { case: { $lt: ['$porcentajeUtilizacion', 75] }, then: '50-75%' },
                  { case: { $lt: ['$porcentajeUtilizacion', 90] }, then: '75-90%' },
                  { case: { $gte: ['$porcentajeUtilizacion', 90] }, then: '90-100%' }
                ],
                default: 'Sin clasificar'
              }
            }
          },
          count: { $sum: 1 },
          promedioUtilizacion: { $avg: '$porcentajeUtilizacion' }
        }
      },
      { $sort: { '_id.rango': 1 } }
    ]);

    // 7. Obtener nombres de ONGs desde SQL Server
    const pool = await poolPromise;
    let ongNames = {};
    if (topOngs.length > 0) {
      const ongIds = topOngs.map(ong => ong._id);
      const ongsResult = await pool.request()
        .query(`
          SELECT o.id_usuario, o.nombre_ong, u.nombre_usuario
          FROM onGs o
          INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
          WHERE o.id_usuario IN (${ongIds.join(',')})
        `);
      
      ongNames = ongsResult.recordset.reduce((acc, ong) => {
        acc[ong.id_usuario] = {
          nombreOng: ong.nombre_ong,
          nombreUsuario: ong.nombre_usuario
        };
        return acc;
      }, {});
    }

    // Enriquecer datos de ONGs
    const topOngsEnriquecidas = topOngs.map(ong => ({
      ...ong,
      nombreOng: ongNames[ong._id]?.nombreOng || 'ONG Desconocida',
      nombreUsuario: ongNames[ong._id]?.nombreUsuario || 'Usuario Desconocido'
    }));

    // Calcular KPIs
    const stats = statsBasicas[0] || {};
    const tasaAsistenciaPromedio = stats.totalParticipantesInscritos > 0 
      ? Math.round((stats.totalAsistentes / stats.totalParticipantesInscritos) * 100) 
      : 0;
    
    const tasaFinalizacion = stats.totalEventos > 0 
      ? Math.round((stats.eventosFinalizados / stats.totalEventos) * 100) 
      : 0;

    const capacidadPromedioUtilizada = stats.capacidadTotalOfrecida > 0 
      ? Math.round((stats.totalParticipantesInscritos / stats.capacidadTotalOfrecida) * 100) 
      : 0;

    const dashboard = {
      resumenGeneral: {
        ...stats,
        tasaAsistenciaPromedio,
        tasaFinalizacion,
        capacidadPromedioUtilizada
      },
      distribucionEstados: eventosPorEstado,
      eventosPorTipo,
      topOngsActivas: topOngsEnriquecidas,
      tendenciasTemporal: eventosPorMes,
      utilizacionCapacidad,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      filtrosAplicados: { fechaInicio, fechaFin, ongId }
    });

  } catch (error) {
    console.error('💥 Error generando dashboard general:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard general'
    });
  }
};

// Dashboard de participación y engagement
const getDashboardParticipacion = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, ongId } = req.query;
    
    console.log('👥 Generando dashboard de participación...');
    
    let filtrosBase = { activo: true };
    if (fechaInicio || fechaFin) {
      filtrosBase.fechaInicio = {};
      if (fechaInicio) filtrosBase.fechaInicio.$gte = new Date(fechaInicio);
      if (fechaFin) filtrosBase.fechaInicio.$lte = new Date(fechaFin);
    }
    if (ongId) filtrosBase.ongId = parseInt(ongId);

    // 1. Análisis de participación por tipo de participante
    const participacionPorTipo = await Evento.aggregate([
      { $match: filtrosBase },
      { $unwind: '$participantes' },
      {
        $group: {
          _id: '$participantes.tipoParticipante',
          totalParticipantes: { $sum: 1 },
          participantesAsistieron: { $sum: { $cond: ['$participantes.asistencia', 1, 0] } }
        }
      },
      {
        $addFields: {
          tasaAsistencia: {
            $multiply: [
              { $divide: ['$participantesAsistieron', '$totalParticipantes'] },
              100
            ]
          }
        }
      }
    ]);

    // 2. Eventos con mayor y menor participación
    const eventosPorParticipacion = await Evento.aggregate([
      { $match: filtrosBase },
      {
        $project: {
          titulo: 1,
          fechaInicio: 1,
          tipoEvento: 1,
          ongId: 1,
          totalInscritos: '$metricas.totalInscritos',
          totalAsistentes: '$metricas.totalAsistentes',
          porcentajeAsistencia: '$metricas.porcentajeAsistencia',
          capacidadMaxima: 1
        }
      },
      { $sort: { totalInscritos: -1 } }
    ]);

    const eventosMayorParticipacion = eventosPorParticipacion.slice(0, 10);
    const eventosMenorParticipacion = eventosPorParticipacion.slice(-10).reverse();

    // 3. Análisis de asistencia vs inscripciones
    const analisisAsistencia = await Evento.aggregate([
      { $match: { ...filtrosBase, 'metricas.totalInscritos': { $gt: 0 } } },
      {
        $addFields: {
          rangoAsistencia: {
            $switch: {
              branches: [
                { case: { $lt: ['$metricas.porcentajeAsistencia', 25] }, then: '0-25%' },
                { case: { $lt: ['$metricas.porcentajeAsistencia', 50] }, then: '25-50%' },
                { case: { $lt: ['$metricas.porcentajeAsistencia', 75] }, then: '50-75%' },
                { case: { $gte: ['$metricas.porcentajeAsistencia', 75] }, then: '75-100%' }
              ],
              default: 'Sin datos'
            }
          }
        }
      },
      {
        $group: {
          _id: '$rangoAsistencia',
          totalEventos: { $sum: 1 },
          promedioInscritos: { $avg: '$metricas.totalInscritos' },
          promedioAsistentes: { $avg: '$metricas.totalAsistentes' }
        }
      }
    ]);

    // 4. Participación por día de la semana
    const participacionPorDia = await Evento.aggregate([
      { $match: filtrosBase },
      {
        $addFields: {
          diaSemana: { $dayOfWeek: '$fechaInicio' }
        }
      },
      {
        $group: {
          _id: '$diaSemana',
          totalEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          promedioParticipantes: { $avg: '$metricas.totalInscritos' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Mapear días de la semana
    const diasSemana = ['', 'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const participacionPorDiaFormateado = participacionPorDia.map(dia => ({
      ...dia,
      nombreDia: diasSemana[dia._id]
    }));

    // 5. Eventos con sobrecapacidad (más inscritos que capacidad)
    const eventosSobrecapacidad = await Evento.aggregate([
      { 
        $match: { 
          ...filtrosBase, 
          capacidadMaxima: { $ne: null, $gt: 0 },
          $expr: { $gt: ['$metricas.totalInscritos', '$capacidadMaxima'] }
        } 
      },
      {
        $project: {
          titulo: 1,
          fechaInicio: 1,
          capacidadMaxima: 1,
          totalInscritos: '$metricas.totalInscritos',
          exceso: { $subtract: ['$metricas.totalInscritos', '$capacidadMaxima'] }
        }
      },
      { $sort: { exceso: -1 } }
    ]);

    const dashboard = {
      participacionPorTipo,
      eventosMayorParticipacion,
      eventosMenorParticipacion,
      analisisAsistencia,
      participacionPorDia: participacionPorDiaFormateado,
      eventosSobrecapacidad,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      filtrosAplicados: { fechaInicio, fechaFin, ongId }
    });

  } catch (error) {
    console.error('💥 Error generando dashboard de participación:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard de participación'
    });
  }
};

// Dashboard de patrocinios y empresas
const getDashboardPatrocinios = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    console.log('💰 Generando dashboard de patrocinios...');
    
    const pool = await poolPromise;
    
    // Construir filtros de fecha para SQL
    let filtrosFechaSQL = '';
    if (fechaInicio || fechaFin) {
      const condiciones = [];
      if (fechaInicio) condiciones.push(`e.F_Inicio >= '${fechaInicio}'`);
      if (fechaFin) condiciones.push(`e.F_Inicio <= '${fechaFin}'`);
      filtrosFechaSQL = 'AND ' + condiciones.join(' AND ');
    }

    // 1. Estadísticas generales de patrocinios
    const statsPatrocinios = await pool.request().query(`
      SELECT 
        COUNT(DISTINCT ep.empresa_id) as totalEmpresasPatrocinadoras,
        COUNT(DISTINCT ep.evento_id) as totalEventosPatrocinados,
        COUNT(*) as totalPatrocinios,
        
        COUNT(DISTINCT ea.empresa_id) as totalEmpresasAuspiciadoras,
        COUNT(DISTINCT ea.evento_id) as totalEventosAuspiciados,
        COUNT(ea.empresa_id) as totalAuspicios
      FROM Eventos e
      LEFT JOIN evento_patrocinadores ep ON e.EventoID = ep.evento_id
      LEFT JOIN evento_Auspiciadores ea ON e.EventoID = ea.evento_id
      WHERE 1=1 ${filtrosFechaSQL}
    `);

    // 2. Top empresas patrocinadoras (por número de eventos)
    const topPatrocinadoras = await pool.request().query(`
      SELECT TOP 10
        emp.nombre_empresa,
        u.nombre_usuario,
        COUNT(ep.evento_id) as totalEventosPatrocinados,
        COUNT(DISTINCT o.id_usuario) as totalOngsApoyadas
      FROM evento_patrocinadores ep
      INNER JOIN empresas emp ON ep.empresa_id = emp.id_usuario
      INNER JOIN usuarios u ON emp.id_usuario = u.id_usuario
      INNER JOIN Eventos e ON ep.evento_id = e.EventoID
      LEFT JOIN onGs o ON e.ong_id = o.id_usuario
      WHERE 1=1 ${filtrosFechaSQL}
      GROUP BY emp.id_usuario, emp.nombre_empresa, u.nombre_usuario
      ORDER BY totalEventosPatrocinados DESC
    `);

    // 3. Top empresas auspiciadoras
    const topAuspiciadoras = await pool.request().query(`
      SELECT TOP 10
        emp.nombre_empresa,
        u.nombre_usuario,
        COUNT(ea.evento_id) as totalEventosAuspiciados,
        COUNT(DISTINCT o.id_usuario) as totalOngsApoyadas
      FROM evento_Auspiciadores ea
      INNER JOIN empresas emp ON ea.empresa_id = emp.id_usuario
      INNER JOIN usuarios u ON emp.id_usuario = u.id_usuario
      INNER JOIN Eventos e ON ea.evento_id = e.EventoID
      LEFT JOIN onGs o ON e.ong_id = o.id_usuario
      WHERE 1=1 ${filtrosFechaSQL}
      GROUP BY emp.id_usuario, emp.nombre_empresa, u.nombre_usuario
      ORDER BY totalEventosAuspiciados DESC
    `);

    // 4. Eventos con más apoyo empresarial
    const eventosConMasApoyo = await pool.request().query(`
      SELECT TOP 10
        e.EventoID,
        e.Tittulo,
        e.F_Inicio,
        e.Tipo_evento,
        ong.nombre_ong,
        COUNT(DISTINCT ep.empresa_id) as totalPatrocinadores,
        COUNT(DISTINCT ea.empresa_id) as totalAuspiciadores,
        (COUNT(DISTINCT ep.empresa_id) + COUNT(DISTINCT ea.empresa_id)) as totalEmpresasApoyo
      FROM Eventos e
      LEFT JOIN evento_patrocinadores ep ON e.EventoID = ep.evento_id
      LEFT JOIN evento_Auspiciadores ea ON e.EventoID = ea.evento_id
      LEFT JOIN onGs ong ON e.ong_id = ong.id_usuario
      WHERE 1=1 ${filtrosFechaSQL}
      GROUP BY e.EventoID, e.Tittulo, e.F_Inicio, e.Tipo_evento, ong.nombre_ong
      HAVING (COUNT(DISTINCT ep.empresa_id) + COUNT(DISTINCT ea.empresa_id)) > 0
      ORDER BY totalEmpresasApoyo DESC
    `);

    // 5. Análisis de colaboración empresas-ONGs
    const colaboracionEmpresasOngs = await pool.request().query(`
      SELECT 
        emp.nombre_empresa,
        ong.nombre_ong,
        COUNT(DISTINCT e.EventoID) as eventosColaborados,
        MIN(e.F_Inicio) as primeraColaboracion,
        MAX(e.F_Inicio) as ultimaColaboracion
      FROM Eventos e
      INNER JOIN (
        SELECT evento_id, empresa_id FROM evento_patrocinadores
        UNION
        SELECT evento_id, empresa_id FROM evento_Auspiciadores
      ) colaboraciones ON e.EventoID = colaboraciones.evento_id
      INNER JOIN empresas emp ON colaboraciones.empresa_id = emp.id_usuario
      INNER JOIN onGs ong ON e.ong_id = ong.id_usuario
      WHERE 1=1 ${filtrosFechaSQL}
      GROUP BY emp.id_usuario, emp.nombre_empresa, ong.id_usuario, ong.nombre_ong
      HAVING COUNT(DISTINCT e.EventoID) >= 2
      ORDER BY eventosColaborados DESC
    `);

    // 6. Distribución por tipo de evento
    const patrociniosPorTipoEvento = await pool.request().query(`
      SELECT 
        e.Tipo_evento,
        COUNT(DISTINCT ep.empresa_id) as empresasPatrocinadoras,
        COUNT(DISTINCT ea.empresa_id) as empresasAuspiciadoras,
        COUNT(DISTINCT e.EventoID) as totalEventos,
        (COUNT(DISTINCT ep.empresa_id) + COUNT(DISTINCT ea.empresa_id)) as totalEmpresasInvolucradas
      FROM Eventos e
      LEFT JOIN evento_patrocinadores ep ON e.EventoID = ep.evento_id
      LEFT JOIN evento_Auspiciadores ea ON e.EventoID = ea.evento_id
      WHERE 1=1 ${filtrosFechaSQL}
      GROUP BY e.Tipo_evento
      ORDER BY totalEmpresasInvolucradas DESC
    `);

    const dashboard = {
      estadisticasGenerales: statsPatrocinios.recordset[0],
      topEmpresasPatrocinadoras: topPatrocinadoras.recordset,
      topEmpresasAuspiciadoras: topAuspiciadoras.recordset,
      eventosConMasApoyo: eventosConMasApoyo.recordset,
      colaboracionesEstrategicas: colaboracionEmpresasOngs.recordset,
      patrociniosPorTipoEvento: patrociniosPorTipoEvento.recordset,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      filtrosAplicados: { fechaInicio, fechaFin }
    });

  } catch (error) {
    console.error('💥 Error generando dashboard de patrocinios:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard de patrocinios'
    });
  }
};

// Dashboard de rendimiento de ONGs
const getDashboardOngs = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, ongId } = req.query;
    
    console.log('🏢 Generando dashboard de ONGs...');
    
    let filtrosBase = { activo: true };
    if (fechaInicio || fechaFin) {
      filtrosBase.fechaInicio = {};
      if (fechaInicio) filtrosBase.fechaInicio.$gte = new Date(fechaInicio);
      if (fechaFin) filtrosBase.fechaInicio.$lte = new Date(fechaFin);
    }
    if (ongId) filtrosBase.ongId = parseInt(ongId);

    // 1. Ranking de ONGs por métricas
    const rankingOngs = await Evento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: '$ongId',
          totalEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalAsistentes: { $sum: '$metricas.totalAsistentes' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' },
          eventosFinalizados: { $sum: { $cond: [{ $eq: ['$estado', 'finalizado'] }, 1, 0] } },
          eventosCancelados: { $sum: { $cond: [{ $eq: ['$estado', 'cancelado'] }, 1, 0] } }
        }
      },
      {
        $addFields: {
          tasaFinalizacion: {
            $multiply: [
              { $divide: ['$eventosFinalizados', '$totalEventos'] },
              100
            ]
          },
          participantesPorEvento: { $divide: ['$totalParticipantes', '$totalEventos'] }
        }
      },
      { $sort: { totalParticipantes: -1 } }
    ]);

    // 2. Análisis de diversidad de eventos por ONG
    const diversidadEventos = await Evento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: { ongId: '$ongId', tipoEvento: '$tipoEvento' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.ongId',
          tiposEventos: { $push: { tipo: '$_id.tipoEvento', cantidad: '$count' } },
          diversidadTipos: { $sum: 1 }
        }
      },
      { $sort: { diversidadTipos: -1 } }
    ]);

    // 3. ONGs con mejor tasa de asistencia
    const mejorAsistencia = await Evento.aggregate([
      { 
        $match: { 
          ...filtrosBase, 
          'metricas.totalInscritos': { $gt: 0 },
          estado: 'finalizado'
        } 
      },
      {
        $group: {
          _id: '$ongId',
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' },
          totalEventosFinalizados: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' }
        }
      },
      {
        $match: {
          totalEventosFinalizados: { $gte: 3 } // Solo ONGs con al menos 3 eventos finalizados
        }
      },
      { $sort: { promedioAsistencia: -1 } },
      { $limit: 10 }
    ]);

    // 4. Obtener datos de ONGs desde SQL Server
    const pool = await poolPromise;
    const ongIds = [...new Set([
      ...rankingOngs.map(o => o._id),
      ...diversidadEventos.map(o => o._id),
      ...mejorAsistencia.map(o => o._id)
    ])];

    let ongData = {};
    if (ongIds.length > 0) {
      const result = await pool.request().query(`
        SELECT 
          o.id_usuario,
          o.nombre_ong,
          u.nombre_usuario,
          u.correo_electronico,
          o.descripcion,
          o.telefono,
          u.fecha_registro
        FROM onGs o
        INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
        WHERE o.id_usuario IN (${ongIds.join(',')})
      `);

      ongData = result.recordset.reduce((acc, ong) => {
        acc[ong.id_usuario] = ong;
        return acc;
      }, {});
    }

    // 5. Análisis de patrocinios obtenidos por ONG
    const patrociniosPorOng = await pool.request().query(`
      SELECT 
        o.id_usuario as ongId,
        o.nombre_ong,
        COUNT(DISTINCT ep.empresa_id) as totalPatrocinadores,
        COUNT(DISTINCT ea.empresa_id) as totalAuspiciadores,
        COUNT(DISTINCT e.EventoID) as eventosConApoyo
      FROM onGs o
      INNER JOIN Eventos e ON o.id_usuario = e.ong_id
      LEFT JOIN evento_patrocinadores ep ON e.EventoID = ep.evento_id
      LEFT JOIN evento_Auspiciadores ea ON e.EventoID = ea.evento_id
      ${ongId ? `WHERE o.id_usuario = ${ongId}` : ''}
      GROUP BY o.id_usuario, o.nombre_ong
      HAVING COUNT(DISTINCT ep.empresa_id) > 0 OR COUNT(DISTINCT ea.empresa_id) > 0
      ORDER BY (COUNT(DISTINCT ep.empresa_id) + COUNT(DISTINCT ea.empresa_id)) DESC
    `);

    // Enriquecer datos con información de SQL Server
    const rankingOngsEnriquecido = rankingOngs.map(ong => ({
      ...ong,
      ...ongData[ong._id],
      patrocinios: patrociniosPorOng.recordset.find(p => p.ongId === ong._id) || {
        totalPatrocinadores: 0,
        totalAuspiciadores: 0,
        eventosConApoyo: 0
      }
    }));

    const mejorAsistenciaEnriquecida = mejorAsistencia.map(ong => ({
      ...ong,
      ...ongData[ong._id]
    }));

    const diversidadEventosEnriquecida = diversidadEventos.map(ong => ({
      ...ong,
      ...ongData[ong._id]
    }));

    const dashboard = {
      rankingOngs: rankingOngsEnriquecido,
      diversidadEventos: diversidadEventosEnriquecida,
      mejorAsistencia: mejorAsistenciaEnriquecida,
      patrociniosPorOng: patrociniosPorOng.recordset,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      filtrosAplicados: { fechaInicio, fechaFin, ongId }
    });

  } catch (error) {
    console.error('💥 Error generando dashboard de ONGs:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard de ONGs'
    });
  }
};

// Dashboard de análisis temporal y tendencias
const getDashboardTendencias = async (req, res) => {
  try {
    const { periodo = 'mes' } = req.query; // mes, semana, año
    
    console.log('📈 Generando dashboard de tendencias...');
    
    // Determinar agrupación temporal
    let agrupacionTemporal;
    switch (periodo) {
      case 'semana':
        agrupacionTemporal = {
          año: { $year: '$fechaInicio' },
          semana: { $week: '$fechaInicio' }
        };
        break;
      case 'año':
        agrupacionTemporal = {
          año: { $year: '$fechaInicio' }
        };
        break;
      default: // mes
        agrupacionTemporal = {
          año: { $year: '$fechaInicio' },
          mes: { $month: '$fechaInicio' }
        };
    }

    // 1. Tendencia de creación de eventos
    const tendenciaEventos = await Evento.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: agrupacionTemporal,
          totalEventos: { $sum: 1 },
          eventosPublicados: { $sum: { $cond: [{ $eq: ['$estado', 'publicado'] }, 1, 0] } },
          eventosFinalizados: { $sum: { $cond: [{ $eq: ['$estado', 'finalizado'] }, 1, 0] } },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1, '_id.semana': 1 } }
    ]);

    // 2. Crecimiento de ONGs activas por período
    const crecimientoOngs = await Evento.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: {
            periodo: agrupacionTemporal,
            ongId: '$ongId'
          }
        }
      },
      {
        $group: {
          _id: '$_id.periodo',
          ongsActivas: { $sum: 1 }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1, '_id.semana': 1 } }
    ]);

    // 3. Tendencia de participación por tipo de evento
    const tendenciaTipoEvento = await Evento.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: {
            periodo: agrupacionTemporal,
            tipoEvento: '$tipoEvento'
          },
          totalEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' }
        }
      },
      { $sort: { '_id.período.año': 1, '_id.período.mes': 1 } }
    ]);

    // 4. Análisis de estacionalidad (por mes del año)
    const analisisEstacional = await Evento.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: { $month: '$fechaInicio' },
          totalEventos: { $sum: 1 },
          promedioParticipantes: { $avg: '$metricas.totalInscritos' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Mapear nombres de meses
    const nombresMeses = [
      '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const estacionalidadFormateada = analisisEstacional.map(mes => ({
      ...mes,
      nombreMes: nombresMeses[mes._id]
    }));

    // 5. Predicción simple basada en tendencia (últimos 6 períodos)
    const ultimosPeriodos = tendenciaEventos.slice(-6);
    let prediccion = null;
    
    if (ultimosPeriodos.length >= 3) {
      const totalEventosUltimosPeriodos = ultimosPeriodos.map(p => p.totalEventos);
      const promedio = totalEventosUltimosPeriodos.reduce((a, b) => a + b, 0) / totalEventosUltimosPeriodos.length;
      
      // Calcular tendencia simple
      const primerMitad = totalEventosUltimosPeriodos.slice(0, Math.floor(totalEventosUltimosPeriodos.length / 2));
      const segundaMitad = totalEventosUltimosPeriodos.slice(Math.floor(totalEventosUltimosPeriodos.length / 2));
      
      const promedioPrimero = primerMitad.reduce((a, b) => a + b, 0) / primerMitad.length;
      const promedioSegundo = segundaMitad.reduce((a, b) => a + b, 0) / segundaMitad.length;
      
      const tendencia = promedioSegundo - promedioPrimero;
      
      prediccion = {
        proximoPeriodo: Math.max(0, Math.round(promedio + tendencia)),
        tendencia: tendencia > 0 ? 'creciente' : tendencia < 0 ? 'decreciente' : 'estable',
        confianza: ultimosPeriodos.length >= 6 ? 'alta' : 'media'
      };
    }

    const dashboard = {
      tendenciaEventos,
      crecimientoOngs,
      tendenciaTipoEvento,
      estacionalidad: estacionalidadFormateada,
      prediccion,
      periodoAnalisis: periodo,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard
    });

  } catch (error) {
    console.error('💥 Error generando dashboard de tendencias:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard de tendencias'
    });
  }
};

// Dashboard comparativo entre ONGs
const getDashboardComparativo = async (req, res) => {
  try {
    const { ongIds } = req.query; // Array de IDs de ONGs para comparar
    
    if (!ongIds || !Array.isArray(ongIds) || ongIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren al menos 2 ONGs para comparar'
      });
    }

    console.log('🔄 Generando dashboard comparativo...');
    
    const ongIdsNum = ongIds.map(id => parseInt(id));

    // 1. Métricas comparativas básicas
    const metricas = await Evento.aggregate([
      { $match: { activo: true, ongId: { $in: ongIdsNum } } },
      {
        $group: {
          _id: '$ongId',
          totalEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalAsistentes: { $sum: '$metricas.totalAsistentes' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' },
          eventosFinalizados: { $sum: { $cond: [{ $eq: ['$estado', 'finalizado'] }, 1, 0] } },
          eventosCancelados: { $sum: { $cond: [{ $eq: ['$estado', 'cancelado'] }, 1, 0] } },
          capacidadPromedio: { $avg: '$capacidadMaxima' }
        }
      }
    ]);

    // 2. Distribución por tipo de evento
    const distribucionTipos = await Evento.aggregate([
      { $match: { activo: true, ongId: { $in: ongIdsNum } } },
      {
        $group: {
          _id: { ongId: '$ongId', tipoEvento: '$tipoEvento' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.ongId',
          tiposEventos: { 
            $push: { 
              tipo: '$_id.tipoEvento', 
              cantidad: '$count' 
            } 
          }
        }
      }
    ]);

    // 3. Evolución temporal comparativa (últimos 12 meses)
    const evolucionTemporal = await Evento.aggregate([
      { 
        $match: { 
          activo: true, 
          ongId: { $in: ongIdsNum },
          fechaInicio: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) }
        } 
      },
      {
        $group: {
          _id: {
            ongId: '$ongId',
            año: { $year: '$fechaInicio' },
            mes: { $month: '$fechaInicio' }
          },
          eventosCreados: { $sum: 1 },
          participantes: { $sum: '$metricas.totalInscritos' }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1 } }
    ]);

    // 4. Obtener datos de ONGs desde SQL Server
    const pool = await poolPromise;
    const ongData = await pool.request().query(`
      SELECT 
        o.id_usuario,
        o.nombre_ong,
        u.nombre_usuario,
        u.fecha_registro,
        o.descripcion
      FROM onGs o
      INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
      WHERE o.id_usuario IN (${ongIdsNum.join(',')})
    `);

    // 5. Análisis de patrocinios comparativo
    const patrociniosComparativos = await pool.request().query(`
      SELECT 
        o.id_usuario as ongId,
        COUNT(DISTINCT ep.empresa_id) as totalPatrocinadores,
        COUNT(DISTINCT ea.empresa_id) as totalAuspiciadores,
        COUNT(DISTINCT e.EventoID) as eventosConApoyo
      FROM onGs o
      INNER JOIN Eventos e ON o.id_usuario = e.ong_id
      LEFT JOIN evento_patrocinadores ep ON e.EventoID = ep.evento_id
      LEFT JOIN evento_Auspiciadores ea ON e.EventoID = ea.evento_id
      WHERE o.id_usuario IN (${ongIdsNum.join(',')})
      GROUP BY o.id_usuario
    `);

    // Crear mapa de datos de ONGs
    const ongDataMap = ongData.recordset.reduce((acc, ong) => {
      acc[ong.id_usuario] = ong;
      return acc;
    }, {});

    const patrociniosMap = patrociniosComparativos.recordset.reduce((acc, pat) => {
      acc[pat.ongId] = pat;
      return acc;
    }, {});

    // Enriquecer métricas con datos adicionales
    const metricasEnriquecidas = metricas.map(metrica => ({
      ...metrica,
      ...ongDataMap[metrica._id],
      patrocinios: patrociniosMap[metrica._id] || {
        totalPatrocinadores: 0,
        totalAuspiciadores: 0,
        eventosConApoyo: 0
      },
      eficienciaAsistencia: metrica.totalParticipantes > 0 ? 
        Math.round((metrica.totalAsistentes / metrica.totalParticipantes) * 100) : 0,
      tasaFinalizacion: metrica.totalEventos > 0 ? 
        Math.round((metrica.eventosFinalizados / metrica.totalEventos) * 100) : 0
    }));

    const dashboard = {
      metricasComparativas: metricasEnriquecidas,
      distribucionTiposEventos: distribucionTipos,
      evolucionTemporal,
      ongsComparadas: ongData.recordset,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      totalOngsComparadas: ongIdsNum.length
    });

  } catch (error) {
    console.error('💥 Error generando dashboard comparativo:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard comparativo'
    });
  }
};

module.exports = {
  getDashboardGeneral,
  getDashboardParticipacion,
  getDashboardPatrocinios,
  getDashboardOngs,
  getDashboardTendencias,
  getDashboardComparativo
};