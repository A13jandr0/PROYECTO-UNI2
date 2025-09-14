// routes/dashboard.routes.js
const express = require('express');
const router = express.Router();

// Importar controladores
const eventosDashboard = require('../controllers/DachE.controller');
const megaEventosDashboard = require('../controllers/DachME.controller');

// ================= RUTAS DASHBOARD EVENTOS REGULARES =================

// Dashboard general de eventos
router.get('/eventos/general', eventosDashboard.getDashboardGeneral);

// Dashboard de participación y engagement
router.get('/eventos/participacion', eventosDashboard.getDashboardParticipacion);

// Dashboard de patrocinios y empresas
router.get('/eventos/patrocinios', eventosDashboard.getDashboardPatrocinios);

// Dashboard de rendimiento de ONGs
router.get('/eventos/ongs', eventosDashboard.getDashboardOngs);

// Dashboard de tendencias temporales
router.get('/eventos/tendencias', eventosDashboard.getDashboardTendencias);

// Dashboard comparativo entre ONGs
router.get('/eventos/comparativo', eventosDashboard.getDashboardComparativo);

// ================= RUTAS DASHBOARD MEGA EVENTOS =================

// Dashboard general de mega eventos
router.get('/mega-eventos/general', megaEventosDashboard.getDashboardMegaEventosGeneral);

// Dashboard de colaboración entre ONGs
router.get('/mega-eventos/colaboracion', megaEventosDashboard.getDashboardColaboracion);

// Dashboard de patrocinios en mega eventos
router.get('/mega-eventos/patrocinios', megaEventosDashboard.getDashboardPatrociniosMegaEventos);

// Dashboard de participación masiva
router.get('/mega-eventos/participacion', megaEventosDashboard.getDashboardParticipacionMasiva);

// Dashboard de impacto y ROI
router.get('/mega-eventos/impacto', megaEventosDashboard.getDashboardImpacto);

// Dashboard comparativo de mega eventos
router.get('/mega-eventos/comparativo', megaEventosDashboard.getDashboardComparativoMegaEventos);

// Dashboard de tendencias y predicciones
router.get('/mega-eventos/tendencias', megaEventosDashboard.getDashboardTendenciasMegaEventos);

// ================= RUTAS COMBINADAS =================

// Dashboard general del sistema (eventos + mega eventos)
router.get('/sistema/general', async (req, res) => {
  try {
    console.log('🌟 Generando dashboard general del sistema...');
    
    // Ejecutar ambos dashboards en paralelo
    const [eventosReq, megaEventosReq] = await Promise.all([
      // Simular request para eventos
      new Promise((resolve) => {
        const mockReq = { query: req.query };
        const mockRes = {
          json: (data) => resolve(data),
          status: () => mockRes
        };
        eventosDashboard.getDashboardGeneral(mockReq, mockRes);
      }),
      // Simular request para mega eventos
      new Promise((resolve) => {
        const mockReq = { query: req.query };
        const mockRes = {
          json: (data) => resolve(data),
          status: () => mockRes
        };
        megaEventosDashboard.getDashboardMegaEventosGeneral(mockReq, mockRes);
      })
    ]);

    // Combinar resultados
    const dashboardCombinado = {
      eventos: eventosReq.success ? eventosReq.dashboard : null,
      megaEventos: megaEventosReq.success ? megaEventosReq.dashboard : null,
      resumenGlobal: {
        totalEventosRegulares: eventosReq.dashboard?.resumenGeneral?.totalEventos || 0,
        totalMegaEventos: megaEventosReq.dashboard?.resumenGeneral?.totalMegaEventos || 0,
        totalParticipantesEventos: eventosReq.dashboard?.resumenGeneral?.totalParticipantesInscritos || 0,
        totalParticipantesMegaEventos: megaEventosReq.dashboard?.resumenGeneral?.totalParticipantesInscritos || 0,
        totalPatrocinadoresEventos: eventosReq.dashboard?.resumenGeneral?.totalPatrocinadores || 0,
        totalPatrocinadoresMegaEventos: megaEventosReq.dashboard?.resumenGeneral?.totalPatrocinadores || 0
      },
      fecha: new Date()
    };

    // Calcular totales globales
    dashboardCombinado.resumenGlobal.totalEventosGeneral = 
      dashboardCombinado.resumenGlobal.totalEventosRegulares + 
      dashboardCombinado.resumenGlobal.totalMegaEventos;
    
    dashboardCombinado.resumenGlobal.totalParticipantesGeneral = 
      dashboardCombinado.resumenGlobal.totalParticipantesEventos + 
      dashboardCombinado.resumenGlobal.totalParticipantesMegaEventos;

    res.json({
      success: true,
      dashboard: dashboardCombinado,
      filtrosAplicados: req.query
    });

  } catch (error) {
    console.error('💥 Error generando dashboard general del sistema:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar dashboard general del sistema'
    });
  }
});

// Dashboard de comparación eventos vs mega eventos
router.get('/sistema/comparacion', async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    console.log('⚖️ Generando comparación eventos vs mega eventos...');
    
    // Importar modelos
    const Evento = require('../models/evento.model');
    const MegaEvento = require('../models/MegaEvento.model');
    
    // Filtros base
    let filtros = { activo: true };
    if (fechaInicio || fechaFin) {
      filtros.fechaInicio = {};
      if (fechaInicio) filtros.fechaInicio.$gte = new Date(fechaInicio);
      if (fechaFin) filtros.fechaInicio.$lte = new Date(fechaFin);
    }

    // Estadísticas comparativas
    const [eventosStats, megaEventosStats] = await Promise.all([
      Evento.aggregate([
        { $match: filtros },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalParticipantes: { $sum: '$metricas.totalInscritos' },
            promedioParticipantes: { $avg: '$metricas.totalInscritos' },
            promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' },
            totalFinalizados: { $sum: { $cond: [{ $eq: ['$estado', 'finalizado'] }, 1, 0] } }
          }
        }
      ]),
      MegaEvento.aggregate([
        { $match: filtros },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalParticipantes: { $sum: '$metricas.totalInscritos' },
            promedioParticipantes: { $avg: '$metricas.totalInscritos' },
            promedioAsistencia: { $avg: '$metricas.porcentajeAsistencia' },
            totalFinalizados: { $sum: { $cond: [{ $eq: ['$estado', 'finalizado'] }, 1, 0] } },
            totalOngsColaboradoras: { $sum: '$metricas.totalOngsParticipantes' },
            promedioOngsColaboradoras: { $avg: '$metricas.totalOngsParticipantes' }
          }
        }
      ])
    ]);

    const comparacion = {
      eventos: eventosStats[0] || {},
      megaEventos: megaEventosStats[0] || {},
      analisis: {
        eficienciaParticipacion: {
          eventos: eventosStats[0]?.promedioParticipantes || 0,
          megaEventos: megaEventosStats[0]?.promedioParticipantes || 0
        },
        tasaFinalizacion: {
          eventos: eventosStats[0]?.total > 0 ? 
            Math.round((eventosStats[0].totalFinalizados / eventosStats[0].total) * 100) : 0,
          megaEventos: megaEventosStats[0]?.total > 0 ? 
            Math.round((megaEventosStats[0].totalFinalizados / megaEventosStats[0].total) * 100) : 0
        },
        impactoColaborativo: {
          megaEventos: megaEventosStats[0]?.promedioOngsColaboradoras || 0
        }
      },
      fecha: new Date()
    };

    res.json({
      success: true,
      comparacion,
      filtrosAplicados: { fechaInicio, fechaFin }
    });

  } catch (error) {
    console.error('💥 Error generando comparación eventos vs mega eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar comparación'
    });
  }
});

// Endpoint para obtener todas las métricas disponibles
router.get('/metricas/disponibles', (req, res) => {
  const metricasDisponibles = {
    eventos: [
      {
        categoria: 'General',
        metricas: [
          'Total de eventos',
          'Eventos por estado',
          'Eventos por tipo',
          'Tasa de finalización',
          'Capacidad promedio utilizada'
        ]
      },
      {
        categoria: 'Participación',
        metricas: [
          'Total participantes inscritos',
          'Participantes por tipo',
          'Tasa de asistencia promedio',
          'Eventos con sobrecapacidad',
        ]
      },
      {
        categoria: 'Patrocinios',
        metricas: [
          'Total empresas patrocinadoras',
          'Total empresas auspiciadoras',
          'Eventos con mayor apoyo empresarial',
          'Colaboraciones estratégicas empresa-ONG',
          'Patrocinios por tipo de evento'
        ]
      },
      {
        categoria: 'ONGs',
        metricas: [
          'Ranking ONGs más activas',
          'Diversidad de tipos de eventos por ONG',
          'ONGs con mejor tasa de asistencia',
          'Patrocinios obtenidos por ONG'
        ]
      },
      {
        categoria: 'Tendencias',
        metricas: [
          'Evolución temporal de eventos',
          'Crecimiento de ONGs activas',
          'Análisis de estacionalidad',
          'Predicciones simples'
        ]
      }
    ],
    megaEventos: [
      {
        categoria: 'General',
        metricas: [
          'Total mega eventos',
          'Mega eventos por estado',
          'Mega eventos por categoría',
          'Promedio ONGs colaboradoras',
          'Promedio patrocinadores por evento'
        ]
      },
      {
        categoria: 'Colaboración',
        metricas: [
          'Redes de colaboración entre ONGs',
          'ONGs más colaborativas',
          'Roles de colaboración',
          'Mega eventos más colaborativos',
          'Colaboración por categoría'
        ]
      },
      {
        categoria: 'Patrocinios',
        metricas: [
          'Top empresas patrocinadoras',
          'Patrocinios por tipo',
          'Mega eventos con mayor apoyo financiero',
          'Fidelidad de patrocinadores',
          'Evolución temporal de patrocinios',
          'ROI y efectividad por categoría'
        ]
      },
      {
        categoria: 'Participación Masiva',
        metricas: [
          'Total participantes únicos',
          'Participación por tipo (voluntario/participante)',
          'Participantes más activos',
          'Distribución geográfica',
          'Análisis de capacidad y demanda'
        ]
      },
      {
        categoria: 'Impacto',
        metricas: [
          'Personas impactadas totales',
          'Impacto por categoría',
          'Evolución del impacto',
          'Mega eventos con mayor impacto social',
          'Eficiencia costo-beneficio',
          'Impacto en ecosistema de ONGs'
        ]
      }
    ],
    sistema: [
      {
        categoria: 'Comparativo',
        metricas: [
          'Eventos regulares vs Mega eventos',
          'Eficiencia de participación',
          'Tasa de finalización comparativa',
          'Impacto colaborativo'
        ]
      }
    ]
  };

  res.json({
    success: true,
    metricas: metricasDisponibles,
    totalCategorias: Object.keys(metricasDisponibles).length,
    fecha: new Date()
  });
});

// Endpoint para obtener filtros disponibles
router.get('/filtros/disponibles', async (req, res) => {
  try {
    const { poolPromise } = require('../config/db');
    const pool = await poolPromise;

    // Obtener tipos de eventos únicos
    const tiposEventos = await pool.request().query(`
      SELECT DISTINCT Tipo_evento 
      FROM Eventos 
      WHERE Tipo_evento IS NOT NULL 
      ORDER BY Tipo_evento
    `);

    // Obtener categorías de mega eventos
    const MegaEvento = require('../models/MegaEvento.model');
    const categoriasMegaEventos = await MegaEvento.distinct('categoria', { activo: true });

    // Obtener ONGs activas
    const ongsActivas = await pool.request().query(`
      SELECT DISTINCT o.id_usuario, o.nombre_ong 
      FROM onGs o 
      INNER JOIN usuarios u ON o.id_usuario = u.id_usuario 
      WHERE u.activo = 1 
      ORDER BY o.nombre_ong
    `);

    // Obtener empresas activas
    const empresasActivas = await pool.request().query(`
      SELECT DISTINCT e.id_usuario, e.nombre_empresa 
      FROM empresas e 
      INNER JOIN usuarios u ON e.id_usuario = u.id_usuario 
      WHERE u.activo = 1 
      ORDER BY e.nombre_empresa
    `);

    const filtrosDisponibles = {
      temporal: {
        periodos: ['mes', 'trimestre', 'año'],
        rangosFrecuentes: [
          { nombre: 'Último mes', dias: 30 },
          { nombre: 'Últimos 3 meses', dias: 90 },
          { nombre: 'Últimos 6 meses', dias: 180 },
          { nombre: 'Último año', dias: 365 }
        ]
      },
      eventos: {
        tipos: tiposEventos.recordset.map(t => t.Tipo_evento),
        estados: ['borrador', 'publicado', 'en_curso', 'finalizado', 'suspendido', 'cancelado']
      },
      megaEventos: {
        categorias: categoriasMegaEventos,
        estados: ['planificacion', 'convocatoria', 'organizacion', 'en_curso', 'finalizado', 'cancelado', 'pospuesto']
      },
      organizaciones: {
        ongs: ongsActivas.recordset.map(o => ({ id: o.id_usuario, nombre: o.nombre_ong })),
        empresas: empresasActivas.recordset.map(e => ({ id: e.id_usuario, nombre: e.nombre_empresa }))
      },
      geograficos: {
        ciudades: ['Santa Cruz', 'La Paz', 'Cochabamba', 'Sucre', 'Potosí', 'Tarija', 'Oruro', 'Beni', 'Pando']
      }
    };

    res.json({
      success: true,
      filtros: filtrosDisponibles,
      fecha: new Date()
    });

  } catch (error) {
    console.error('💥 Error obteniendo filtros disponibles:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener filtros disponibles'
    });
  }
});

// Endpoint para validar filtros
router.post('/filtros/validar', (req, res) => {
  try {
    const filtros = req.body;
    const errores = [];

    // Validar fechas
    if (filtros.fechaInicio && filtros.fechaFin) {
      const inicio = new Date(filtros.fechaInicio);
      const fin = new Date(filtros.fechaFin);
      
      if (inicio >= fin) {
        errores.push('La fecha de inicio debe ser anterior a la fecha de fin');
      }
      
      const diferenciaDias = (fin - inicio) / (1000 * 60 * 60 * 24);
      if (diferenciaDias > 1095) { // 3 años
        errores.push('El rango de fechas no puede ser mayor a 3 años');
      }
    }

    // Validar IDs numéricos
    if (filtros.ongId && (!Number.isInteger(Number(filtros.ongId)) || Number(filtros.ongId) <= 0)) {
      errores.push('ID de ONG debe ser un número entero positivo');
    }

    if (filtros.empresaId && (!Number.isInteger(Number(filtros.empresaId)) || Number(filtros.empresaId) <= 0)) {
      errores.push('ID de empresa debe ser un número entero positivo');
    }

    // Validar arrays para comparación
    if (filtros.ongIds && (!Array.isArray(filtros.ongIds) || filtros.ongIds.length < 2)) {
      errores.push('Para comparación se requieren al menos 2 ONGs');
    }

    if (filtros.megaEventoIds && (!Array.isArray(filtros.megaEventoIds) || filtros.megaEventoIds.length < 2)) {
      errores.push('Para comparación se requieren al menos 2 mega eventos');
    }

    res.json({
      success: errores.length === 0,
      valido: errores.length === 0,
      errores,
      filtrosValidados: errores.length === 0 ? filtros : null
    });

  } catch (error) {
    console.error('💥 Error validando filtros:', error);
    res.status(500).json({
      success: false,
      error: 'Error al validar filtros'
    });
  }
});

// Middleware para logging de requests a dashboard
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const endpoint = req.originalUrl;
  const filtros = JSON.stringify(req.query);
  
  console.log(`📊 [${timestamp}] Dashboard Request: ${req.method} ${endpoint} - Filtros: ${filtros}`);
  next();
});

// Endpoint de salud para el sistema de dashboard
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'Dashboard system operational',
    endpoints: {
      eventos: [
        '/dashboard/eventos/general',
        '/dashboard/eventos/participacion',
        '/dashboard/eventos/patrocinios',
        '/dashboard/eventos/ongs',
        '/dashboard/eventos/tendencias',
        '/dashboard/eventos/comparativo'
      ],
      megaEventos: [
        '/dashboard/mega-eventos/general',
        '/dashboard/mega-eventos/colaboracion',
        '/dashboard/mega-eventos/patrocinios',
        '/dashboard/mega-eventos/participacion',
        '/dashboard/mega-eventos/impacto',
        '/dashboard/mega-eventos/comparativo',
        '/dashboard/mega-eventos/tendencias'
      ],
      sistema: [
        '/dashboard/sistema/general',
        '/dashboard/sistema/comparacion'
      ],
      utilidades: [
        '/dashboard/metricas/disponibles',
        '/dashboard/filtros/disponibles',
        '/dashboard/filtros/validar',
        '/dashboard/health'
      ]
    },
    timestamp: new Date()
  });
});

module.exports = router;