const { poolPromise } = require('../config/db');
const MegaEvento = require('../models/MegaEvento.model');

// =================== DASHBOARD MEGA EVENTOS ===================

// Dashboard principal de mega eventos
const getDashboardMegaEventosGeneral = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, ongId } = req.query;
    
    console.log('🎯 Generando dashboard general de mega eventos...');
    
    // Filtros base
    let filtrosBase = { activo: true };
    if (fechaInicio || fechaFin) {
      filtrosBase.fechaInicio = {};
      if (fechaInicio) filtrosBase.fechaInicio.$gte = new Date(fechaInicio);
      if (fechaFin) filtrosBase.fechaInicio.$lte = new Date(fechaFin);
    }
    if (ongId) filtrosBase.ongOrganizadoraPrincipal = parseInt(ongId);

    // 1. Estadísticas generales de mega eventos
    const statsGenerales = await MegaEvento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: null,
          totalMegaEventos: { $sum: 1 },
          megaEventosPublicos: { $sum: { $cond: ['$esPublico', 1, 0] } },
          megaEventosFinalizados: { $sum: { $cond: [{ $eq: ['$estado', 'finalizado'] }, 1, 0] } },
          megaEventosEnCurso: { $sum: { $cond: [{ $eq: ['$estado', 'en_curso'] }, 1, 0] } },
          megaEventosCancelados: { $sum: { $cond: [{ $eq: ['$estado', 'cancelado'] }, 1, 0] } },
          totalParticipantesInscritos: { $sum: '$metricas.totalInscritos' },
          totalAsistentes: { $sum: '$metricas.totalAsistentes' },
          totalOngsParticipantes: { $sum: '$metricas.totalOngsParticipantes' },
          totalPatrocinadores: { $sum: '$metricas.totalPatrocinadores' },
          capacidadTotalOfrecida: { $sum: '$capacidadMaxima' }
        }
      }
    ]);

    // 2. Mega eventos por estado
    const megaEventosPorEstado = await MegaEvento.aggregate([
      { $match: filtrosBase },
      { $group: { _id: '$estado', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // 3. Mega eventos por categoría
    const megaEventosPorCategoria = await MegaEvento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: '$categoria',
          count: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalPatrocinadores: { $sum: '$metricas.totalPatrocinadores' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // 4. Top ONGs organizadoras principales
    const topOngsOrganizadoras = await MegaEvento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: '$ongOrganizadoraPrincipal',
          totalMegaEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalPatrocinadores: { $sum: '$metricas.totalPatrocinadores' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' }
        }
      },
      { $sort: { totalMegaEventos: -1 } },
      { $limit: 10 }
    ]);

    // 5. Análisis temporal de mega eventos
    const megaEventosPorMes = await MegaEvento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: {
            año: { $year: '$fechaInicio' },
            mes: { $month: '$fechaInicio' }
          },
          totalMegaEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalOngsInvolucradas: { $sum: '$metricas.totalOngsParticipantes' }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1 } }
    ]);

    // 6. Mega eventos con mayor impacto (por participantes y ONGs)
    const megaEventosMayorImpacto = await MegaEvento.aggregate([
      { $match: { ...filtrosBase, estado: { $in: ['finalizado', 'en_curso'] } } },
      {
        $addFields: {
          impactoScore: {
            $add: [
              { $multiply: ['$metricas.totalInscritos', 0.6] },
              { $multiply: ['$metricas.totalOngsParticipantes', 40] },
              { $multiply: ['$metricas.totalPatrocinadores', 20] }
            ]
          }
        }
      },
      {
        $project: {
          titulo: 1,
          fechaInicio: 1,
          categoria: 1,
          estado: 1,
          totalInscritos: '$metricas.totalInscritos',
          totalOngsParticipantes: '$metricas.totalOngsParticipantes',
          totalPatrocinadores: '$metricas.totalPatrocinadores',
          impactoScore: 1
        }
      },
      { $sort: { impactoScore: -1 } },
      { $limit: 10 }
    ]);

    // 7. Obtener datos de ONGs desde SQL Server
    const pool = await poolPromise;
    let ongData = {};
    if (topOngsOrganizadoras.length > 0) {
      const ongIds = topOngsOrganizadoras.map(ong => ong._id);
      const ongsResult = await pool.request().query(`
        SELECT 
          o.id_usuario,
          o.nombre_ong,
          u.nombre_usuario,
          u.correo_electronico,
          o.descripcion
        FROM onGs o
        INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
        WHERE o.id_usuario IN (${ongIds.join(',')})
      `);

      ongData = ongsResult.recordset.reduce((acc, ong) => {
        acc[ong.id_usuario] = ong;
        return acc;
      }, {});
    }

    // Enriquecer datos de ONGs
    const topOngsEnriquecidas = topOngsOrganizadoras.map(ong => ({
      ...ong,
      ...ongData[ong._id]
    }));

    // Calcular KPIs
    const stats = statsGenerales[0] || {};
    const tasaParticipacionPromedio = stats.totalParticipantesInscritos > 0 && stats.capacidadTotalOfrecida > 0
      ? Math.round((stats.totalParticipantesInscritos / stats.capacidadTotalOfrecida) * 100)
      : 0;

    const promedioOngsColaboradoras = stats.totalMegaEventos > 0
      ? Math.round(stats.totalOngsParticipantes / stats.totalMegaEventos)
      : 0;

    const promedioPatrocinadoresPorEvento = stats.totalMegaEventos > 0
      ? Math.round(stats.totalPatrocinadores / stats.totalMegaEventos)
      : 0;

    const dashboard = {
      resumenGeneral: {
        ...stats,
        tasaParticipacionPromedio,
        promedioOngsColaboradoras,
        promedioPatrocinadoresPorEvento
      },
      distribucionEstados: megaEventosPorEstado,
      megaEventosPorCategoria,
      topOngsOrganizadoras: topOngsEnriquecidas,
      tendenciasTemporal: megaEventosPorMes,
      megaEventosMayorImpacto,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      filtrosAplicados: { fechaInicio, fechaFin, ongId }
    });

  } catch (error) {
    console.error('💥 Error generando dashboard general de mega eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard general de mega eventos'
    });
  }
};

// Dashboard de colaboración entre ONGs
const getDashboardColaboracion = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    console.log('🤝 Generando dashboard de colaboración entre ONGs...');
    
    const pool = await poolPromise;
    
    // Filtros de fecha para SQL
    let filtrosFechaSQL = '';
    if (fechaInicio || fechaFin) {
      const condiciones = [];
      if (fechaInicio) condiciones.push(`me.fecha_inicio >= '${fechaInicio}'`);
      if (fechaFin) condiciones.push(`me.fecha_inicio <= '${fechaFin}'`);
      filtrosFechaSQL = 'AND ' + condiciones.join(' AND ');
    }

    // 1. Análisis de colaboraciones entre ONGs
    const redesColaboracion = await pool.request().query(`
      SELECT 
        ong_principal.nombre_ong as ongPrincipal,
        ong_colaboradora.nombre_ong as ongColaboradora,
        COUNT(DISTINCT me.MegaEventoID) as megaEventosColaborados,
        SUM(CASE WHEN me.estado = 'finalizado' THEN 1 ELSE 0 END) as eventosFinalizados,
        MIN(me.fecha_inicio) as primeraColaboracion,
        MAX(me.fecha_inicio) as ultimaColaboracion
      FROM mega_eventos me
      INNER JOIN onGs ong_principal ON me.ong_organizadora_principal = ong_principal.id_usuario
      INNER JOIN mega_evento_ongs_organizadoras meo ON me.MegaEventoID = meo.mega_evento_id
      INNER JOIN onGs ong_colaboradora ON meo.ong_id = ong_colaboradora.id_usuario
      WHERE meo.activo = 1 AND me.ong_organizadora_principal != meo.ong_id ${filtrosFechaSQL}
      GROUP BY ong_principal.id_usuario, ong_principal.nombre_ong, 
               ong_colaboradora.id_usuario, ong_colaboradora.nombre_ong
      HAVING COUNT(DISTINCT me.MegaEventoID) >= 2
      ORDER BY megaEventosColaborados DESC
    `);

    // 2. ONGs más colaborativas (que más participan como organizadoras)
    const ongsMasColaborativas = await pool.request().query(`
      SELECT 
        o.nombre_ong,
        u.nombre_usuario,
        COUNT(DISTINCT meo.mega_evento_id) as totalMegaEventosComoColaboradora,
        COUNT(DISTINCT me_principal.MegaEventoID) as totalMegaEventosComoPrincipal,
        COUNT(DISTINCT CASE WHEN me.estado = 'finalizado' THEN meo.mega_evento_id END) as eventosFinalizadosComoColaboradora
      FROM onGs o
      INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
      LEFT JOIN mega_evento_ongs_organizadoras meo ON o.id_usuario = meo.ong_id AND meo.activo = 1
      LEFT JOIN mega_eventos me ON meo.mega_evento_id = me.MegaEventoID
      LEFT JOIN mega_eventos me_principal ON o.id_usuario = me_principal.ong_organizadora_principal
      WHERE 1=1 ${filtrosFechaSQL.replace('me.', 'COALESCE(me., me_principal.)')}
      GROUP BY o.id_usuario, o.nombre_ong, u.nombre_usuario
      HAVING COUNT(DISTINCT meo.mega_evento_id) > 0 OR COUNT(DISTINCT me_principal.MegaEventoID) > 0
      ORDER BY (COUNT(DISTINCT meo.mega_evento_id) + COUNT(DISTINCT me_principal.MegaEventoID)) DESC
    `);

    // 3. Análisis de roles de colaboración
    const rolesPorOng = await pool.request().query(`
      SELECT 
        meo.rol_organizacion,
        COUNT(DISTINCT meo.ong_id) as totalOngs,
        COUNT(DISTINCT meo.mega_evento_id) as totalMegaEventos,
        AVG(CAST(CASE WHEN me.estado = 'finalizado' THEN 1 ELSE 0 END as FLOAT)) * 100 as porcentajeExito
      FROM mega_evento_ongs_organizadoras meo
      INNER JOIN mega_eventos me ON meo.mega_evento_id = me.MegaEventoID
      WHERE meo.activo = 1 ${filtrosFechaSQL.replace('me.', 'me.')}
      GROUP BY meo.rol_organizacion
      ORDER BY totalMegaEventos DESC
    `);

    // 4. Mega eventos con mayor número de ONGs colaboradoras
    const megaEventosMasColaborativo = await pool.request().query(`
      SELECT TOP 10
        me.titulo,
        me.fecha_inicio,
        me.categoria,
        me.estado,
        ong_principal.nombre_ong as ongPrincipal,
        COUNT(DISTINCT meo.ong_id) as totalOngsColaboradoras
      FROM mega_eventos me
      INNER JOIN onGs ong_principal ON me.ong_organizadora_principal = ong_principal.id_usuario
      LEFT JOIN mega_evento_ongs_organizadoras meo ON me.MegaEventoID = meo.mega_evento_id AND meo.activo = 1
      WHERE 1=1 ${filtrosFechaSQL.replace('me.', 'me.')}
      GROUP BY me.MegaEventoID, me.titulo, me.fecha_inicio, me.categoria, me.estado, ong_principal.nombre_ong
      ORDER BY totalOngsColaboradoras DESC
    `);

    // 5. Filtros para mega eventos con colaboración desde MongoDB
    let filtrosBase = { activo: true };
    if (fechaInicio || fechaFin) {
      filtrosBase.fechaInicio = {};
      if (fechaInicio) filtrosBase.fechaInicio.$gte = new Date(fechaInicio);
      if (fechaFin) filtrosBase.fechaInicio.$lte = new Date(fechaFin);
    }

    // Análisis de diversidad de colaboración por categoría
    const colaboracionPorCategoria = await MegaEvento.aggregate([
      { $match: { ...filtrosBase, 'metricas.totalOngsParticipantes': { $gt: 1 } } },
      {
        $group: {
          _id: '$categoria',
          totalMegaEventos: { $sum: 1 },
          promedioOngsColaboradoras: { $avg: '$metricas.totalOngsParticipantes' },
          totalOngsUnicas: { $sum: '$metricas.totalOngsParticipantes' }
        }
      },
      { $sort: { promedioOngsColaboradoras: -1 } }
    ]);

    const dashboard = {
      redesColaboracion: redesColaboracion.recordset,
      ongsMasColaborativas: ongsMasColaborativas.recordset,
      rolesPorOng: rolesPorOng.recordset,
      megaEventosMasColaborativo: megaEventosMasColaborativo.recordset,
      colaboracionPorCategoria,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      filtrosAplicados: { fechaInicio, fechaFin }
    });

  } catch (error) {
    console.error('💥 Error generando dashboard de colaboración:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard de colaboración'
    });
  }
};

// Dashboard de patrocinios en mega eventos
const getDashboardPatrociniosMegaEventos = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    console.log('💎 Generando dashboard de patrocinios de mega eventos...');
    
    const pool = await poolPromise;
    
    // Filtros de fecha
    let filtrosFechaSQL = '';
    if (fechaInicio || fechaFin) {
      const condiciones = [];
      if (fechaInicio) condiciones.push(`me.fecha_inicio >= '${fechaInicio}'`);
      if (fechaFin) condiciones.push(`me.fecha_inicio <= '${fechaFin}'`);
      filtrosFechaSQL = 'AND ' + condiciones.join(' AND ');
    }

    // 1. Estadísticas generales de patrocinios en mega eventos
    const statsPatrocinios = await pool.request().query(`
      SELECT 
        COUNT(DISTINCT mep.empresa_id) as totalEmpresasPatrocinadoras,
        COUNT(DISTINCT mep.mega_evento_id) as totalMegaEventosPatrocinados,
        COUNT(*) as totalPatrocinios,
        SUM(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE 0 END) as montoTotalContribuciones,
        AVG(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE NULL END) as promedioContribucion
      FROM mega_evento_patrocinadores mep
      INNER JOIN mega_eventos me ON mep.mega_evento_id = me.MegaEventoID
      WHERE mep.activo = 1 ${filtrosFechaSQL}
    `);

    // 2. Top empresas patrocinadoras de mega eventos
    const topPatrocinadoras = await pool.request().query(`
      SELECT TOP 15
        emp.nombre_empresa,
        u.nombre_usuario,
        COUNT(DISTINCT mep.mega_evento_id) as totalMegaEventosPatrocinados,
        COUNT(DISTINCT me.ong_organizadora_principal) as totalOngsApoyadas,
        SUM(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE 0 END) as montoTotalContribuido,
        STRING_AGG(DISTINCT mep.tipo_patrocinio, ', ') as tiposPatrocinio
      FROM mega_evento_patrocinadores mep
      INNER JOIN empresas emp ON mep.empresa_id = emp.id_usuario
      INNER JOIN usuarios u ON emp.id_usuario = u.id_usuario
      INNER JOIN mega_eventos me ON mep.mega_evento_id = me.MegaEventoID
      WHERE mep.activo = 1 ${filtrosFechaSQL}
      GROUP BY emp.id_usuario, emp.nombre_empresa, u.nombre_usuario
      ORDER BY totalMegaEventosPatrocinados DESC, montoTotalContribuido DESC
    `);

    // 3. Análisis por tipo de patrocinio
    const patrociniosPorTipo = await pool.request().query(`
      SELECT 
        mep.tipo_patrocinio,
        COUNT(DISTINCT mep.empresa_id) as totalEmpresas,
        COUNT(DISTINCT mep.mega_evento_id) as totalMegaEventos,
        SUM(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE 0 END) as montoTotal,
        AVG(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE NULL END) as promedioMonto
      FROM mega_evento_patrocinadores mep
      INNER JOIN mega_eventos me ON mep.mega_evento_id = me.MegaEventoID
      WHERE mep.activo = 1 ${filtrosFechaSQL}
      GROUP BY mep.tipo_patrocinio
      ORDER BY montoTotal DESC
    `);

    // 4. Mega eventos con mayor apoyo financiero
    const megaEventosMayorApoyo = await pool.request().query(`
      SELECT TOP 10
        me.titulo,
        me.fecha_inicio,
        me.categoria,
        ong.nombre_ong as ongOrganizadora,
        COUNT(DISTINCT mep.empresa_id) as totalPatrocinadores,
        SUM(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE 0 END) as montoTotalRecaudado,
        STRING_AGG(DISTINCT emp.nombre_empresa, ', ') as empresasPatrocinadoras
      FROM mega_eventos me
      INNER JOIN mega_evento_patrocinadores mep ON me.MegaEventoID = mep.mega_evento_id AND mep.activo = 1
      INNER JOIN empresas emp ON mep.empresa_id = emp.id_usuario
      INNER JOIN onGs ong ON me.ong_organizadora_principal = ong.id_usuario
      WHERE 1=1 ${filtrosFechaSQL}
      GROUP BY me.MegaEventoID, me.titulo, me.fecha_inicio, me.categoria, ong.nombre_ong
      ORDER BY montoTotalRecaudado DESC, totalPatrocinadores DESC
    `);

    // 5. Análisis de fidelidad de patrocinadores (empresas que patrocinan múltiples mega eventos)
    const fidelidadPatrocinadores = await pool.request().query(`
      SELECT 
        emp.nombre_empresa,
        COUNT(DISTINCT mep.mega_evento_id) as totalMegaEventosPatrocinados,
        COUNT(DISTINCT me.ong_organizadora_principal) as totalOngsApoyadas,
        MIN(me.fecha_inicio) as primerPatrocinio,
        MAX(me.fecha_inicio) as ultimoPatrocinio,
        DATEDIFF(month, MIN(me.fecha_inicio), MAX(me.fecha_inicio)) as mesesDeRelacion
      FROM mega_evento_patrocinadores mep
      INNER JOIN empresas emp ON mep.empresa_id = emp.id_usuario
      INNER JOIN mega_eventos me ON mep.mega_evento_id = me.MegaEventoID
      WHERE mep.activo = 1 ${filtrosFechaSQL}
      GROUP BY emp.id_usuario, emp.nombre_empresa
      HAVING COUNT(DISTINCT mep.mega_evento_id) >= 2
      ORDER BY totalMegaEventosPatrocinados DESC
    `);

    // 6. Evolución temporal de patrocinios
    const evolucionPatrocinios = await pool.request().query(`
      SELECT 
        YEAR(me.fecha_inicio) as año,
        MONTH(me.fecha_inicio) as mes,
        COUNT(DISTINCT mep.empresa_id) as empresasPatrocinadoras,
        COUNT(DISTINCT mep.mega_evento_id) as megaEventosConPatrocinio,
        SUM(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE 0 END) as montoTotal
      FROM mega_eventos me
      INNER JOIN mega_evento_patrocinadores mep ON me.MegaEventoID = mep.mega_evento_id AND mep.activo = 1
      WHERE 1=1 ${filtrosFechaSQL}
      GROUP BY YEAR(me.fecha_inicio), MONTH(me.fecha_inicio)
      ORDER BY año, mes
    `);

    // 7. ROI y efectividad de patrocinios (basado en participación)
    let filtrosBase = { activo: true };
    if (fechaInicio || fechaFin) {
      filtrosBase.fechaInicio = {};
      if (fechaInicio) filtrosBase.fechaInicio.$gte = new Date(fechaInicio);
      if (fechaFin) filtrosBase.fechaInicio.$lte = new Date(fechaFin);
    }

    const efectividadPatrocinios = await MegaEvento.aggregate([
      { $match: { ...filtrosBase, 'metricas.totalPatrocinadores': { $gt: 0 } } },
      {
        $addFields: {
          participantesPorPatrocinador: {
            $divide: ['$metricas.totalInscritos', '$metricas.totalPatrocinadores']
          },
          indiceColaboracion: {
            $multiply: [
              { $divide: ['$metricas.totalOngsParticipantes', 10] },
              { $divide: ['$metricas.totalPatrocinadores', 5] }
            ]
          }
        }
      },
      {
        $group: {
          _id: '$categoria',
          promedioParticipantesPorPatrocinador: { $avg: '$participantesPorPatrocinador' },
          promedioIndiceColaboracion: { $avg: '$indiceColaboracion' },
          totalMegaEventos: { $sum: 1 }
        }
      },
      { $sort: { promedioParticipantesPorPatrocinador: -1 } }
    ]);

    const dashboard = {
      estadisticasGenerales: statsPatrocinios.recordset[0],
      topEmpresasPatrocinadoras: topPatrocinadoras.recordset,
      patrociniosPorTipo: patrociniosPorTipo.recordset,
      megaEventosMayorApoyo: megaEventosMayorApoyo.recordset,
      fidelidadPatrocinadores: fidelidadPatrocinadores.recordset,
      evolucionTemporal: evolucionPatrocinios.recordset,
      efectividadPorCategoria: efectividadPatrocinios,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      filtrosAplicados: { fechaInicio, fechaFin }
    });

  } catch (error) {
    console.error('💥 Error generando dashboard de patrocinios mega eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard de patrocinios mega eventos'
    });
  }
};

// Dashboard de participación masiva en mega eventos
const getDashboardParticipacionMasiva = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    console.log('👥 Generando dashboard de participación masiva...');
    
    const pool = await poolPromise;
    
    // Filtros de fecha
    let filtrosFechaSQL = '';
    if (fechaInicio || fechaFin) {
      const condiciones = [];
      if (fechaInicio) condiciones.push(`me.fecha_inicio >= '${fechaInicio}'`);
      if (fechaFin) condiciones.push(`me.fecha_inicio <= '${fechaFin}'`);
      filtrosFechaSQL = 'AND ' + condiciones.join(' AND ');
    }

    // 1. Estadísticas de participación externa
    const statsParticipacion = await pool.request().query(`
      SELECT 
        COUNT(DISTINCT mep.integrante_externo_id) as totalParticipantesUnicos,
        COUNT(DISTINCT mep.mega_evento_id) as megaEventosConParticipantes,
        COUNT(*) as totalInscripciones,
        SUM(CASE WHEN mep.tipo_participacion = 'voluntario' THEN 1 ELSE 0 END) as totalVoluntarios,
        SUM(CASE WHEN mep.tipo_participacion = 'participante' THEN 1 ELSE 0 END) as totalParticipantes
      FROM mega_evento_participantes_externos mep
      INNER JOIN mega_eventos me ON mep.mega_evento_id = me.MegaEventoID
      WHERE mep.activo = 1 ${filtrosFechaSQL}
    `);

    // 2. Mega eventos con mayor participación
    const megaEventosMayorParticipacion = await pool.request().query(`
      SELECT TOP 15
        me.titulo,
        me.fecha_inicio,
        me.categoria,
        me.capacidad_maxima,
        ong.nombre_ong as ongOrganizadora,
        COUNT(DISTINCT mep.integrante_externo_id) as totalParticipantes,
        COUNT(DISTINCT CASE WHEN mep.tipo_participacion = 'voluntario' THEN mep.integrante_externo_id END) as totalVoluntarios,
        COUNT(DISTINCT CASE WHEN mep.tipo_participacion = 'participante' THEN mep.integrante_externo_id END) as totalAsistentes,
        CASE 
          WHEN me.capacidad_maxima > 0 
          THEN CAST(COUNT(DISTINCT mep.integrante_externo_id) * 100.0 / me.capacidad_maxima AS DECIMAL(5,2))
          ELSE NULL 
        END as porcentajeCapacidad
      FROM mega_eventos me
      INNER JOIN mega_evento_participantes_externos mep ON me.MegaEventoID = mep.mega_evento_id AND mep.activo = 1
      INNER JOIN onGs ong ON me.ong_organizadora_principal = ong.id_usuario
      WHERE 1=1 ${filtrosFechaSQL}
      GROUP BY me.MegaEventoID, me.titulo, me.fecha_inicio, me.categoria, me.capacidad_maxima, ong.nombre_ong
      ORDER BY totalParticipantes DESC
    `);

    // 3. Análisis por tipo de participación
    const participacionPorTipo = await pool.request().query(`
      SELECT 
        mep.tipo_participacion,
        COUNT(DISTINCT mep.integrante_externo_id) as participantesUnicos,
        COUNT(DISTINCT mep.mega_evento_id) as megaEventosParticipados,
        AVG(CAST(COUNT(DISTINCT mep.integrante_externo_id) AS FLOAT)) as promedioParticipantesPorEvento
      FROM mega_evento_participantes_externos mep
      INNER JOIN mega_eventos me ON mep.mega_evento_id = me.MegaEventoID
      WHERE mep.activo = 1 ${filtrosFechaSQL}
      GROUP BY mep.tipo_participacion
    `);

    // 4. Participantes más activos (en múltiples mega eventos)
    const participantesMasActivos = await pool.request().query(`
      SELECT TOP 20
        ie.nombres + ' ' + ie.apellidos as nombreCompleto,
        ie.Email,
        COUNT(DISTINCT mep.mega_evento_id) as totalMegaEventosParticipados,
        STRING_AGG(DISTINCT mep.tipo_participacion, ', ') as tiposParticipacion,
        MIN(mep.fecha_registro) as primeraParticipacion,
        MAX(mep.fecha_registro) as ultimaParticipacion
      FROM mega_evento_participantes_externos mep
      INNER JOIN integrantes_externos ie ON mep.integrante_externo_id = ie.id_usuario
      INNER JOIN mega_eventos me ON mep.mega_evento_id = me.MegaEventoID
      WHERE mep.activo = 1 ${filtrosFechaSQL}
      GROUP BY ie.id_usuario, ie.nombres, ie.apellidos, ie.Email
      HAVING COUNT(DISTINCT mep.mega_evento_id) >= 2
      ORDER BY totalMegaEventosParticipados DESC
    `);

    // 5. Distribución geográfica de participantes (si hay datos de ubicación)
    const distribucionGeografica = await pool.request().query(`
      SELECT 
        me.ubicacion,
        COUNT(DISTINCT mep.integrante_externo_id) as totalParticipantes,
        COUNT(DISTINCT mep.mega_evento_id) as totalMegaEventos,
        AVG(CAST(COUNT(DISTINCT mep.integrante_externo_id) AS FLOAT)) as promedioParticipantesPorEvento
      FROM mega_eventos me
      INNER JOIN mega_evento_participantes_externos mep ON me.MegaEventoID = mep.mega_evento_id AND mep.activo = 1
      WHERE 1=1 ${filtrosFechaSQL}
      GROUP BY me.ubicacion
      ORDER BY totalParticipantes DESC
    `);

    // 6. Análisis desde MongoDB para patrones de participación
    let filtrosBase = { activo: true };
    if (fechaInicio || fechaFin) {
      filtrosBase.fechaInicio = {};
      if (fechaInicio) filtrosBase.fechaInicio.$gte = new Date(fechaInicio);
      if (fechaFin) filtrosBase.fechaInicio.$lte = new Date(fechaFin);
    }

    // Análisis de capacidad y demanda
    const analisisCapacidad = await MegaEvento.aggregate([
      { $match: { ...filtrosBase, capacidadMaxima: { $ne: null, $gt: 0 } } },
      {
        $addFields: {
          porcentajeUtilizacion: {
            $multiply: [
              { $divide: ['$metricas.totalInscritos', '$capacidadMaxima'] },
              100
            ]
          },
          rangoUtilizacion: {
            $switch: {
              branches: [
                { case: { $lt: [{ $divide: ['$metricas.totalInscritos', '$capacidadMaxima'] }, 0.25] }, then: '0-25%' },
                { case: { $lt: [{ $divide: ['$metricas.totalInscritos', '$capacidadMaxima'] }, 0.50] }, then: '25-50%' },
                { case: { $lt: [{ $divide: ['$metricas.totalInscritos', '$capacidadMaxima'] }, 0.75] }, then: '50-75%' },
                { case: { $lt: [{ $divide: ['$metricas.totalInscritos', '$capacidadMaxima'] }, 1.0] }, then: '75-100%' },
                { case: { $gte: [{ $divide: ['$metricas.totalInscritos', '$capacidadMaxima'] }, 1.0] }, then: 'Sobrecapacidad' }
              ],
              default: 'Sin clasificar'
            }
          }
        }
      },
      {
        $group: {
          _id: '$rangoUtilizacion',
          totalMegaEventos: { $sum: 1 },
          promedioUtilizacion: { $avg: '$porcentajeUtilizacion' },
          totalParticipantes: { $sum: '$metricas.totalInscritos' }
        }
      }
    ]);

    // 7. Tendencia de participación por categoría
    const participacionPorCategoria = await MegaEvento.aggregate([
      { $match: filtrosBase },
      {
        $group: {
          _id: '$categoria',
          totalMegaEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          promedioParticipantes: { $avg: '$metricas.totalInscritos' },
          megaEventoConMayorParticipacion: { $max: '$metricas.totalInscritos' }
        }
      },
      { $sort: { totalParticipantes: -1 } }
    ]);

    const dashboard = {
      estadisticasGenerales: statsParticipacion.recordset[0],
      megaEventosMayorParticipacion: megaEventosMayorParticipacion.recordset,
      participacionPorTipo: participacionPorTipo.recordset,
      participantesMasActivos: participantesMasActivos.recordset,
      distribucionGeografica: distribucionGeografica.recordset,
      analisisCapacidad,
      participacionPorCategoria,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      filtrosAplicados: { fechaInicio, fechaFin }
    });

  } catch (error) {
    console.error('💥 Error generando dashboard de participación masiva:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard de participación masiva'
    });
  }
};

// Dashboard de impacto y ROI de mega eventos
const getDashboardImpacto = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, categoria } = req.query;
    
    console.log('📊 Generando dashboard de impacto de mega eventos...');
    
    let filtrosBase = { activo: true };
    if (fechaInicio || fechaFin) {
      filtrosBase.fechaInicio = {};
      if (fechaInicio) filtrosBase.fechaInicio.$gte = new Date(fechaInicio);
      if (fechaFin) filtrosBase.fechaInicio.$lte = new Date(fechaFin);
    }
    if (categoria) filtrosBase.categoria = categoria;

    // 1. Métricas de impacto general
    const impactoGeneral = await MegaEvento.aggregate([
      { $match: { ...filtrosBase, estado: { $in: ['finalizado', 'en_curso'] } } },
      {
        $group: {
          _id: null,
          totalMegaEventos: { $sum: 1 },
          totalPersonasImpactadas: { $sum: '$metricas.totalInscritos' },
          totalOngsColaboradoras: { $sum: '$metricas.totalOngsParticipantes' },
          totalEmpresasInvolucradas: { $sum: '$metricas.totalPatrocinadores' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' }
        }
      }
    ]);

    // 2. Impacto por categoría de mega evento
    const impactoPorCategoria = await MegaEvento.aggregate([
      { $match: { ...filtrosBase, estado: { $in: ['finalizado', 'en_curso'] } } },
      {
        $group: {
          _id: '$categoria',
          totalMegaEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalOngsInvolucradas: { $sum: '$metricas.totalOngsParticipantes' },
          totalPatrocinadores: { $sum: '$metricas.totalPatrocinadores' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' },
          alcancePromedio: { $avg: '$metricas.totalInscritos' }
        }
      },
      {
        $addFields: {
          indiceImpacto: {
            $add: [
              { $multiply: ['$totalParticipantes', 0.4] },
              { $multiply: ['$totalOngsInvolucradas', 50] },
              { $multiply: ['$totalPatrocinadores', 30] }
            ]
          }
        }
      },
      { $sort: { indiceImpacto: -1 } }
    ]);

    // 3. Evolución del impacto en el tiempo
    const evolucionImpacto = await MegaEvento.aggregate([
      { $match: { ...filtrosBase, estado: { $in: ['finalizado', 'en_curso'] } } },
      {
        $group: {
          _id: {
            año: { $year: '$fechaInicio' },
            mes: { $month: '$fechaInicio' }
          },
          totalMegaEventos: { $sum: 1 },
          personasImpactadas: { $sum: '$metricas.totalInscritos' },
          ongsColaboradoras: { $sum: '$metricas.totalOngsParticipantes' },
          empresasPatrocinadoras: { $sum: '$metricas.totalPatrocinadores' }
        }
      },
      {
        $addFields: {
          impactoTotal: {
            $add: [
              { $multiply: ['$personasImpactadas', 0.5] },
              { $multiply: ['$ongsColaboradoras', 40] },
              { $multiply: ['$empresasPatrocinadoras', 25] }
            ]
          }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1 } }
    ]);

    // 4. Mega eventos con mayor impacto social
    const megaEventosMayorImpacto = await MegaEvento.aggregate([
      { $match: { ...filtrosBase, estado: { $in: ['finalizado', 'en_curso'] } } },
      {
        $addFields: {
          impactoSocial: {
            $add: [
              { $multiply: ['$metricas.totalInscritos', 0.3] },
              { $multiply: ['$metricas.totalOngsParticipantes', 60] },
              { $multiply: ['$metricas.totalPatrocinadores', 40] },
              { $multiply: ['$metricas.porcentajeAsistencia', 2] }
            ]
          }
        }
      },
      {
        $project: {
          titulo: 1,
          fechaInicio: 1,
          categoria: 1,
          ongOrganizadoraPrincipal: 1,
          totalInscritos: '$metricas.totalInscritos',
          totalOngsParticipantes: '$metricas.totalOngsParticipantes',
          totalPatrocinadores: '$metricas.totalPatrocinadores',
          porcentajeAsistencia: '$metricas.porcentajeAsistencia',
          impactoSocial: 1
        }
      },
      { $sort: { impactoSocial: -1 } },
      { $limit: 15 }
    ]);

    // 5. Análisis de eficiencia: relación costo-beneficio (basado en patrocinios vs participación)
    const pool = await poolPromise;
    let filtrosFechaSQL = '';
    if (fechaInicio || fechaFin) {
      const condiciones = [];
      if (fechaInicio) condiciones.push(`me.fecha_inicio >= '${fechaInicio}'`);
      if (fechaFin) condiciones.push(`me.fecha_inicio <= '${fechaFin}'`);
      filtrosFechaSQL = 'AND ' + condiciones.join(' AND ');
    }

    const eficienciaEventos = await pool.request().query(`
      SELECT 
        me.titulo,
        me.categoria,
        COUNT(DISTINCT mep.empresa_id) as totalPatrocinadores,
        SUM(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE 0 END) as inversionTotal,
        COUNT(DISTINCT mepe.integrante_externo_id) as totalParticipantes,
        CASE 
          WHEN COUNT(DISTINCT mepe.integrante_externo_id) > 0 AND SUM(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE 0 END) > 0
          THEN SUM(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE 0 END) / COUNT(DISTINCT mepe.integrante_externo_id)
          ELSE NULL 
        END as costoPorParticipante
      FROM mega_eventos me
      LEFT JOIN mega_evento_patrocinadores mep ON me.MegaEventoID = mep.mega_evento_id AND mep.activo = 1
      LEFT JOIN mega_evento_participantes_externos mepe ON me.MegaEventoID = mepe.mega_evento_id AND mepe.activo = 1
      WHERE me.estado IN ('finalizado', 'en_curso') ${filtrosFechaSQL} ${categoria ? `AND me.categoria = '${categoria}'` : ''}
      GROUP BY me.MegaEventoID, me.titulo, me.categoria
      HAVING COUNT(DISTINCT mepe.integrante_externo_id) > 0
      ORDER BY costoPorParticipante ASC
    `);

    // 6. Impacto en el ecosistema de ONGs
    const impactoEcosistema = await MegaEvento.aggregate([
      { $match: { ...filtrosBase, estado: { $in: ['finalizado', 'en_curso'] } } },
      {
        $group: {
          _id: '$ongOrganizadoraPrincipal',
          megaEventosOrganizados: { $sum: 1 },
          totalPersonasImpactadas: { $sum: '$metricas.totalInscritos' },
          ongsColaboradorasAtraidas: { $sum: '$metricas.totalOngsParticipantes' },
          empresasPatrocinadoras: { $sum: '$metricas.totalPatrocinadores' }
        }
      },
      {
        $addFields: {
          capacidadConvocatoria: {
            $divide: ['$totalPersonasImpactadas', '$megaEventosOrganizados']
          },
          capacidadColaboracion: {
            $divide: ['$ongsColaboradorasAtraidas', '$megaEventosOrganizados']
          }
        }
      },
      { $sort: { capacidadConvocatoria: -1 } }
    ]);

    const dashboard = {
      evolucionImpacto,
      megaEventosMayorImpacto,
      eficienciaEventos: eficienciaEventos.recordset,
      impactoEcosistema,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard,
      filtrosAplicados: { fechaInicio, fechaFin, categoria }
    });

  } catch (error) {
    console.error('💥 Error generando dashboard de impacto:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard de impacto'
    });
  }
};

// Dashboard comparativo de mega eventos
const getDashboardComparativoMegaEventos = async (req, res) => {
  try {
    const { megaEventoIds } = req.query;
    
    if (!megaEventoIds || !Array.isArray(megaEventoIds) || megaEventoIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren al menos 2 mega eventos para comparar'
      });
    }

    console.log('🔄 Generando dashboard comparativo de mega eventos...');

    // 1. Obtener datos básicos de los mega eventos desde MongoDB
    const megaEventos = await MegaEvento.find({
      _id: { $in: megaEventoIds },
      activo: true
    }).lean();

    if (megaEventos.length < 2) {
      return res.status(404).json({
        success: false,
        error: 'No se encontraron suficientes mega eventos para comparar'
      });
    }

    // 2. Comparación de métricas básicas
    const comparacionMetricas = megaEventos.map(me => ({
      id: me._id,
      titulo: me.titulo,
      fechaInicio: me.fechaInicio,
      categoria: me.categoria,
      estado: me.estado,
      capacidadMaxima: me.capacidadMaxima,
      metricas: me.metricas,
      utilizacionCapacidad: me.capacidadMaxima > 0 ? 
        Math.round((me.metricas.totalInscritos / me.capacidadMaxima) * 100) : null
    }));

    // 3. Obtener datos de participación desde SQL Server
    const pool = await poolPromise;
    const sqlMegaEventoIds = megaEventos.map(me => me.sqlMegaEventoId);
    
    const participacionDetallada = await pool.request().query(`
      SELECT 
        mep.mega_evento_id,
        mep.tipo_participacion,
        COUNT(DISTINCT mep.integrante_externo_id) as totalParticipantes,
        MIN(mep.fecha_registro) as primeraInscripcion,
        MAX(mep.fecha_registro) as ultimaInscripcion
      FROM mega_evento_participantes_externos mep
      WHERE mep.mega_evento_id IN (${sqlMegaEventoIds.join(',')}) AND mep.activo = 1
      GROUP BY mep.mega_evento_id, mep.tipo_participacion
      ORDER BY mep.mega_evento_id, mep.tipo_participacion
    `);

    // 4. Análisis de patrocinios comparativo
    const patrociniosComparativo = await pool.request().query(`
      SELECT 
        mep.mega_evento_id,
        mep.tipo_patrocinio,
        COUNT(DISTINCT mep.empresa_id) as totalEmpresas,
        SUM(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE 0 END) as montoTotal,
        AVG(CASE WHEN mep.monto_contribucion IS NOT NULL THEN mep.monto_contribucion ELSE NULL END) as promedioContribucion
      FROM mega_evento_patrocinadores mep
      WHERE mep.mega_evento_id IN (${sqlMegaEventoIds.join(',')}) AND mep.activo = 1
      GROUP BY mep.mega_evento_id, mep.tipo_patrocinio
      ORDER BY mep.mega_evento_id, mep.tipo_patrocinio
    `);

    // 5. Análisis de colaboración entre ONGs
    const colaboracionOngs = await pool.request().query(`
      SELECT 
        meo.mega_evento_id,
        meo.rol_organizacion,
        COUNT(DISTINCT meo.ong_id) as totalOngs
      FROM mega_evento_ongs_organizadoras meo
      WHERE meo.mega_evento_id IN (${sqlMegaEventoIds.join(',')}) AND meo.activo = 1
      GROUP BY meo.mega_evento_id, meo.rol_organizacion
      ORDER BY meo.mega_evento_id, meo.rol_organizacion
    `);

    // 6. Obtener información de ONGs organizadoras principales
    const ongsOrganizadoras = await pool.request().query(`
      SELECT 
        me.MegaEventoID,
        o.nombre_ong,
        u.nombre_usuario,
        u.correo_electronico
      FROM mega_eventos me
      INNER JOIN onGs o ON me.ong_organizadora_principal = o.id_usuario
      INNER JOIN usuarios u ON o.id_usuario = u.id_usuario
      WHERE me.MegaEventoID IN (${sqlMegaEventoIds.join(',')})
    `);

    // 7. Crear estructura comparativa
    const comparacionCompleta = comparacionMetricas.map(megaEvento => {
      const sqlMegaEventoId = megaEventos.find(me => me._id.toString() === megaEvento.id.toString()).sqlMegaEventoId;
      
      // Participación detallada
      const participacion = participacionDetallada.recordset
        .filter(p => p.mega_evento_id === sqlMegaEventoId)
        .reduce((acc, p) => {
          acc[p.tipo_participacion] = {
            total: p.totalParticipantes,
            primeraInscripcion: p.primeraInscripcion,
            ultimaInscripcion: p.ultimaInscripcion
          };
          return acc;
        }, {});

      // Patrocinios
      const patrocinios = patrociniosComparativo.recordset
        .filter(p => p.mega_evento_id === sqlMegaEventoId)
        .reduce((acc, p) => {
          acc[p.tipo_patrocinio] = {
            totalEmpresas: p.totalEmpresas,
            montoTotal: p.montoTotal,
            promedioContribucion: p.promedioContribucion
          };
          return acc;
        }, {});

      // Colaboración
      const colaboracion = colaboracionOngs.recordset
        .filter(c => c.mega_evento_id === sqlMegaEventoId)
        .reduce((acc, c) => {
          acc[c.rol_organizacion] = c.totalOngs;
          return acc;
        }, {});

      // ONG organizadora
      const ongOrganizadora = ongsOrganizadoras.recordset
        .find(o => o.MegaEventoID === sqlMegaEventoId);

      return {
        ...megaEvento,
        ongOrganizadora,
        participacionDetallada: participacion,
        patrociniosDetallados: patrocinios,
        colaboracionOngs: colaboracion,
        // Calcular índices comparativos
        indiceParticipacion: megaEvento.metricas.totalInscritos || 0,
        indiceColaboracion: megaEvento.metricas.totalOngsParticipantes || 0,
        indicePatrocinio: megaEvento.metricas.totalPatrocinadores || 0,
        indiceImpacto: (
          (megaEvento.metricas.totalInscritos || 0) * 0.4 +
          (megaEvento.metricas.totalOngsParticipantes || 0) * 50 +
          (megaEvento.metricas.totalPatrocinadores || 0) * 30
        )
      };
    });

    // 8. Análisis de brechas y fortalezas
    const analisisBrechas = {
      mayorParticipacion: comparacionCompleta.reduce((max, me) => 
        me.indiceParticipacion > max.indiceParticipacion ? me : max),
      mayorColaboracion: comparacionCompleta.reduce((max, me) => 
        me.indiceColaboracion > max.indiceColaboracion ? me : max),
      mayorPatrocinio: comparacionCompleta.reduce((max, me) => 
        me.indicePatrocinio > max.indicePatrocinio ? me : max),
      mayorImpacto: comparacionCompleta.reduce((max, me) => 
        me.indiceImpacto > max.indiceImpacto ? me : max)
    };

    // 9. Recomendaciones basadas en la comparación
    const recomendaciones = [];
    
    comparacionCompleta.forEach((me, index) => {
      const otros = comparacionCompleta.filter((_, i) => i !== index);
      const promedioOtros = {
        participacion: otros.reduce((sum, o) => sum + o.indiceParticipacion, 0) / otros.length,
        colaboracion: otros.reduce((sum, o) => sum + o.indiceColaboracion, 0) / otros.length,
        patrocinio: otros.reduce((sum, o) => sum + o.indicePatrocinio, 0) / otros.length
      };

      const recomendacionesME = [];
      if (me.indiceParticipacion < promedioOtros.participacion * 0.8) {
        recomendacionesME.push('Mejorar estrategias de convocatoria y marketing');
      }
      if (me.indiceColaboracion < promedioOtros.colaboracion * 0.8) {
        recomendacionesME.push('Fortalecer alianzas con otras ONGs');
      }
      if (me.indicePatrocinio < promedioOtros.patrocinio * 0.8) {
        recomendacionesME.push('Desarrollar propuesta de valor para empresas');
      }

      recomendaciones.push({
        megaEventoId: me.id,
        titulo: me.titulo,
        recomendaciones: recomendacionesME
      });
    });

    const dashboard = {
      comparacionDetallada: comparacionCompleta,
      analisisBrechas,
      recomendaciones,
      totalMegaEventosComparados: megaEventos.length,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard
    });

  } catch (error) {
    console.error('💥 Error generando dashboard comparativo mega eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard comparativo mega eventos'
    });
  }
};

// Dashboard de tendencias y predicciones para mega eventos
const getDashboardTendenciasMegaEventos = async (req, res) => {
  try {
    const { periodo = 'mes' } = req.query; // mes, trimestre, año
    
    console.log('📈 Generando dashboard de tendencias mega eventos...');

    // 1. Configurar agrupación temporal
    let agrupacionTemporal;
    switch (periodo) {
      case 'trimestre':
        agrupacionTemporal = {
          año: { $year: '$fechaInicio' },
          trimestre: { $ceil: { $divide: [{ $month: '$fechaInicio' }, 3] } }
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

    // 2. Tendencias de creación y participación
    const tendenciasGenerales = await MegaEvento.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: agrupacionTemporal,
          totalMegaEventos: { $sum: 1 },
          megaEventosFinalizados: { $sum: { $cond: [{ $eq: ['$estado', 'finalizado'] }, 1, 0] } },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalOngsColaboradoras: { $sum: '$metricas.totalOngsParticipantes' },
          totalPatrocinadores: { $sum: '$metricas.totalPatrocinadores' },
          promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1, '_id.trimestre': 1 } }
    ]);

    // 3. Tendencias por categoría
    const tendenciasPorCategoria = await MegaEvento.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: {
            periodo: agrupacionTemporal,
            categoria: '$categoria'
          },
          totalMegaEventos: { $sum: 1 },
          totalParticipantes: { $sum: '$metricas.totalInscritos' }
        }
      },
      { $sort: { '_id.periodo.año': 1, '_id.periodo.mes': 1 } }
    ]);

    // 4. Crecimiento de la colaboración inter-ONGs
    const crecimientoColaboracion = await MegaEvento.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: agrupacionTemporal,
          promedioOngsColaboradoras: { $avg: '$metricas.totalOngsParticipantes' },
          megaEventosConColaboracion: { 
            $sum: { $cond: [{ $gt: ['$metricas.totalOngsParticipantes', 1] }, 1, 0] } 
          },
          totalMegaEventos: { $sum: 1 }
        }
      },
      {
        $addFields: {
          porcentajeColaboracion: {
            $multiply: [
              { $divide: ['$megaEventosConColaboracion', '$totalMegaEventos'] },
              100
            ]
          }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1, '_id.trimestre': 1 } }
    ]);

    // 5. Análisis de estacionalidad
    const analisisEstacional = await MegaEvento.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: { $month: '$fechaInicio' },
          totalMegaEventos: { $sum: 1 },
          promedioParticipantes: { $avg: '$metricas.totalInscritos' },
          promedioPatrocinadores: { $avg: '$metricas.totalPatrocinadores' }
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

    // 6. Predicciones simples basadas en tendencias
    let predicciones = null;
    if (tendenciasGenerales.length >= 6) {
      const ultimosPeriodos = tendenciasGenerales.slice(-6);
      
      // Calcular tendencias
      const datosParticipantes = ultimosPeriodos.map(p => p.totalParticipantes);
      const datosEventos = ultimosPeriodos.map(p => p.totalMegaEventos);
      
      const tendenciaParticipantes = (datosParticipantes[datosParticipantes.length - 1] - datosParticipantes[0]) / datosParticipantes.length;
      const tendenciaEventos = (datosEventos[datosEventos.length - 1] - datosEventos[0]) / datosEventos.length;
      
      const promedioParticipantes = datosParticipantes.reduce((a, b) => a + b, 0) / datosParticipantes.length;
      const promedioEventos = datosEventos.reduce((a, b) => a + b, 0) / datosEventos.length;
      
      predicciones = {
        proximoPeriodo: {
          megaEventosEstimados: Math.max(0, Math.round(promedioEventos + tendenciaEventos)),
          participantesEstimados: Math.max(0, Math.round(promedioParticipantes + tendenciaParticipantes))
        },
        tendencia: {
          eventos: tendenciaEventos > 0 ? 'creciente' : tendenciaEventos < 0 ? 'decreciente' : 'estable',
          participacion: tendenciaParticipantes > 0 ? 'creciente' : tendenciaParticipantes < 0 ? 'decreciente' : 'estable'
        },
        confianza: ultimosPeriodos.length >= 8 ? 'alta' : 'media'
      };
    }

    // 7. Análisis de patrones de éxito
    const patronesExito = await MegaEvento.aggregate([
      { 
        $match: { 
          activo: true, 
          estado: 'finalizado',
          'metricas.porcentajeAsistencia': { $gte: 70 },
          'metricas.totalInscritos': { $gte: 100 }
        } 
      },
      {
        $group: {
          _id: '$categoria',
          eventosExitosos: { $sum: 1 },
          promedioParticipantes: { $avg: '$metricas.totalInscritos' },
          promedioPatrocinadores: { $avg: '$metricas.totalPatrocinadores' },
          promedioOngsColaboradoras: { $avg: '$metricas.totalOngsParticipantes' },
          mejorAsistencia: { $max: '$metricas.porcentajeAsistencia' }
        }
      },
      { $sort: { eventosExitosos: -1 } }
    ]);

    const dashboard = {
      tendenciasGenerales,
      tendenciasPorCategoria,
      crecimientoColaboracion,
      estacionalidad: estacionalidadFormateada,
      predicciones,
      patronesExito,
      periodoAnalisis: periodo,
      fecha: new Date()
    };

    res.json({
      success: true,
      dashboard
    });

  } catch (error) {
    console.error('💥 Error generando dashboard de tendencias mega eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard de tendencias mega eventos'
    });
  }
};

module.exports = {
  getDashboardMegaEventosGeneral,
  getDashboardColaboracion,
  getDashboardPatrociniosMegaEventos,
  getDashboardParticipacionMasiva,
  getDashboardImpacto,
  getDashboardComparativoMegaEventos,
  getDashboardTendenciasMegaEventos
};