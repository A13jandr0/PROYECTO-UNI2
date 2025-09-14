const { poolPromise } = require('../config/db');
const Evento = require('../models/evento.model');
const multer = require('multer');
const sharp = require('sharp');
const sql = require('mssql');
// otras importaciones ...
const User  = require('../models/user');   // ← ajusta la ruta según tu estructura


// Estados válidos del evento
const ESTADOS_EVENTO = {
  BORRADOR: 'borrador',
  PUBLICADO: 'publicado', 
  EN_CURSO: 'en_curso',
  FINALIZADO: 'finalizado',
  SUSPENDIDO: 'suspendido',
  CANCELADO: 'cancelado'
};

// Transiciones válidas entre estados
const TRANSICIONES_VALIDAS = {
  [ESTADOS_EVENTO.BORRADOR]: [ESTADOS_EVENTO.PUBLICADO, ESTADOS_EVENTO.CANCELADO],
  [ESTADOS_EVENTO.PUBLICADO]: [ESTADOS_EVENTO.EN_CURSO, ESTADOS_EVENTO.SUSPENDIDO, ESTADOS_EVENTO.CANCELADO],
  [ESTADOS_EVENTO.EN_CURSO]: [ESTADOS_EVENTO.FINALIZADO, ESTADOS_EVENTO.SUSPENDIDO],
  [ESTADOS_EVENTO.SUSPENDIDO]: [ESTADOS_EVENTO.PUBLICADO, ESTADOS_EVENTO.CANCELADO],
  [ESTADOS_EVENTO.FINALIZADO]: [],
  [ESTADOS_EVENTO.CANCELADO]: []
};

// Configuración de Multer
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

const scanCheckIn = async (req, res) => {
  const { eventoId } = req.params;     // este es el _id de Mongo
  const { email } = req.body;          // eliminamos "asistencia" del body, siempre será 1

  if (!email) {
    return res.status(400).json({ success: false, error: 'El email es obligatorio.' });
  }

  try {
    // 0) Obtenemos sqlEventoId desde Mongo
    const eventoMongo = await Evento.findById(eventoId);
    if (!eventoMongo) {
      return res.status(404).json({ success: false, error: 'Evento no encontrado (Mongo).' });
    }
    const sqlEventoId = eventoMongo.sqlEventoId;

    const pool = await poolPromise;

    // 1) Buscamos al externo por Email (debe existir porque ya se registró en "participar")
    const busc = await pool.request()
      .input('email', email.toLowerCase())
      .query(`
        SELECT id_usuario
        FROM integrantes_externos
        WHERE Email = @email
      `);

    if (!busc.recordset.length) {
      return res.status(400).json({ success: false, error: 'No estás registrado en este evento.' });
    }
    const sqlUserId = busc.recordset[0].id_usuario;

    // 2) Verificamos que ya exista la fila en evento_integrantes_externos
    const existe = await pool.request()
      .input('evento_id', sqlEventoId)
      .input('integrante_externo_id', sqlUserId)
      .query(`
        SELECT asistencia
        FROM evento_integrantes_externos
        WHERE evento_id = @evento_id
          AND integrante_externo_id = @integrante_externo_id
      `);

    if (!existe.recordset.length) {
      return res.status(400).json({ success: false, error: 'Aún no estás inscrito como participante.' });
    }
    const { asistencia } = existe.recordset[0]; // asistencia es boolean
    if (asistencia) {
      return res
        .status(409)
        .json({ success: false, error: 'Ya registraste tu asistencia.' });
    }

    // 3) Sólo actualizamos asistencia = 1
    await pool.request()
      .input('evento_id', sqlEventoId)
      .input('integrante_externo_id', sqlUserId)
      .input('asistencia', 1)
      .query(`
        UPDATE evento_integrantes_externos
        SET asistencia = @asistencia
        WHERE evento_id = @evento_id
          AND integrante_externo_id = @integrante_externo_id;
      `);

    // 4) Reflejarlo también en Mongo (si tu método lo soporta)
    await eventoMongo.registrarAsistencia(sqlUserId, 1);

    return res.json({ success: true, message: 'Check-in exitoso. Asistencia registrada.' });

  } catch (err) {
    console.error('Error en scanCheckIn:', err);
    return res.status(500).json({
      success: false,
      error: 'Error interno al procesar el Check-In.'
    });
  }
};





// Procesar y optimizar imágenes
const processImages = async (files) => {
  if (!files || files.length === 0) return [];

  const processedImages = [];
  
  for (const file of files) {
    try {
      const processedBuffer = await sharp(file.buffer)
        .resize(800, 600, { 
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: 80,
          progressive: true
        })
        .toBuffer();

      processedImages.push({
        nombre: file.originalname,
        descripcion: '',
        tipo: 'galeria',
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

// Validar permisos de ONG
const validarONG = async (ongId) => {
  const pool = await poolPromise;
  const userResult = await pool.request()
    .input('id_usuario', ongId)
    .query(`
      SELECT tipo_usuario FROM usuarios
      WHERE id_usuario = @id_usuario AND activo = 1
    `);

  const user = userResult.recordset[0];
  return user && user.tipo_usuario === 'ONG';
};

// Validar cambio de estado
const validarCambioEstado = async (evento, nuevoEstado) => {
  const ahora = new Date();
  
  switch (nuevoEstado) {
    case ESTADOS_EVENTO.PUBLICADO:
      if (!evento.titulo || !evento.fechaInicio || !evento.locacion) {
        return {
          valido: false,
          error: 'El evento debe tener título, fecha de inicio y ubicación para ser publicado'
        };
      }
      
      if (evento.fechaInicio <= ahora) {
        return {
          valido: false,
          error: 'No se puede publicar un evento con fecha de inicio pasada'
        };
      }
      break;
      
    case ESTADOS_EVENTO.EN_CURSO:
      if (evento.fechaInicio > ahora) {
        return {
          valido: false,
          error: 'El evento no puede estar en curso antes de su fecha de inicio'
        };
      }
      
      if (evento.fechaFinal && evento.fechaFinal < ahora) {
        return {
          valido: false,
          error: 'El evento no puede estar en curso después de su fecha final'
        };
      }
      break;
      
    case ESTADOS_EVENTO.FINALIZADO:
      const fechaFin = evento.fechaFinal || evento.fechaInicio;
      if (fechaFin > ahora) {
        return {
          valido: false,
          error: 'No se puede finalizar un evento que aún no ha terminado'
        };
      }
      break;
      
    case ESTADOS_EVENTO.CANCELADO:
      if (evento.participantes.length > 0) {
        console.log(`⚠️ Cancelando evento con ${evento.participantes.length} participantes`);
      }
      break;
  }
  
  return { valido: true };
};

// Ejecutar acciones por estado
const ejecutarAccionesEstado = async (evento, nuevoEstado) => {
  switch (nuevoEstado) {
    case ESTADOS_EVENTO.PUBLICADO:
      evento.publico = true;
      break;
      
    case ESTADOS_EVENTO.EN_CURSO:
      evento.inscripcionAbierta = false;
      break;
      
    case ESTADOS_EVENTO.FINALIZADO:
      evento.metricas = await calcularMetricasFinales(evento);
      evento.fechaFinalizacion = new Date();
      break;
      
    case ESTADOS_EVENTO.CANCELADO:
      evento.publico = false;
      evento.inscripcionAbierta = false;
      evento.fechaCancelacion = new Date();
      break;
      
    case ESTADOS_EVENTO.SUSPENDIDO:
      evento.inscripcionAbierta = false;
      break;
      
    case ESTADOS_EVENTO.BORRADOR:
      evento.publico = false;
      break;
  }
};

// Calcular métricas finales
const calcularMetricasFinales = async (evento) => {
  const totalInscritos = evento.participantes.length;
  const totalAsistentes = evento.participantes.filter(p => p.asistencia === true).length;
  const porcentajeAsistencia = totalInscritos > 0 ? 
    Math.round((totalAsistentes / totalInscritos) * 100) : 0;

  return {
    totalInscritos,
    totalAsistentes,
    porcentajeAsistencia,
    fechaCalculoFinal: new Date(),
    capacidadUtilizada: evento.capacidadMaxima ? 
      Math.round((totalInscritos / evento.capacidadMaxima) * 100) : null
  };
};

// ================== FUNCIONES PRINCIPALES ==================

// CREATE - Crear evento
const createEvent = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      fechaInicio,
      fechaFinal,
      locacion,
      tipoEvento,
      ongId,
      capacidadMaxima,
      inscripcionAbierta,
      fechaLimiteInscripcion,
      patrocinadores,
      auspiciadores,
      estado = ESTADOS_EVENTO.BORRADOR
    } = req.body;

    

    const inscripcionAbiertaFlag =
      inscripcionAbierta === true  ||            // ya es boolean
      inscripcionAbierta === 'true' ||           // "true"
      inscripcionAbierta === '1'    ||           // "1"
      inscripcionAbierta === 1;                  // 1 numérico


    console.log('📝 Creando evento:', { titulo, ongId, estado,inscripcionAbiertaFlag });

    // Validaciones básicas
    if (!titulo || !fechaInicio || !tipoEvento || !ongId || !locacion) {
      return res.status(400).json({ 
        success: false,
        error: 'Faltan campos requeridos: titulo, fechaInicio, tipoEvento, ongId, locacion' 
      });
    }

    // Validar estado
    if (!Object.values(ESTADOS_EVENTO).includes(estado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido',
        estadosValidos: Object.values(ESTADOS_EVENTO)
      });
    }

    // Validar ONG
    const esONG = await validarONG(ongId);
    if (!esONG) {
      return res.status(403).json({ 
        success: false,
        error: 'Solo las ONGs pueden crear eventos' 
      });
    }

    // Validar fechas
    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinalDate = fechaFinal ? new Date(fechaFinal) : null;
    
    if (fechaFinalDate && fechaFinalDate <= fechaInicioDate) {
      return res.status(400).json({
        success: false,
        error: 'La fecha final debe ser posterior a la fecha de inicio'
      });
    }

    // Procesar empresas participantes
    let patrocinadoresList = [];
    let auspiciadoresList = [];
    
    if (patrocinadores) {
      patrocinadoresList = Array.isArray(patrocinadores) ? 
        patrocinadores : JSON.parse(patrocinadores || '[]');
    }
    
    if (auspiciadores) {
      auspiciadoresList = Array.isArray(auspiciadores) ? 
        auspiciadores : JSON.parse(auspiciadores || '[]');
    }

    let locacionObj;
    if (typeof locacion === 'string') {
      try {
        // Intentar parsear si viene como JSON string
        locacionObj = JSON.parse(locacion);
      } catch (e) {
        // Si no es JSON, crear objeto con valores por defecto
        locacionObj = {
          direccion: locacion,
          ciudad: 'No especificada',
          tipoLocacion: 'presencial'
        };
      }
    } else {
      // Si ya es un objeto
      locacionObj = locacion;
    }

    // Transacción SQL Server
    const pool = await poolPromise;
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Crear evento en SQL Server
      const sqlResult = await transaction.request()
      .input('Tittulo', titulo)
      .input('Descripcion', descripcion || null)
      .input('F_Inicio', fechaInicioDate)
      .input('F_final', fechaFinalDate)
      .input('Locacion', locacionObj.direccion) // Solo la dirección para SQL
      .input('ong_id', parseInt(ongId))
      .input('Tipo_evento', tipoEvento)
      .query(`
        INSERT INTO Eventos (Tittulo, Descripcion, F_Inicio, F_final, Locacion, ong_id, Tipo_evento)
        OUTPUT INSERTED.EventoID
        VALUES (@Tittulo, @Descripcion, @F_Inicio, @F_final, @Locacion, @ong_id, @Tipo_evento)
      `);
      
      const sqlEventoId = sqlResult.recordset[0].EventoID;

      // Registrar patrocinadores
      for (const empresaId of patrocinadoresList) {
        await transaction.request()
          .input('evento_id', sqlEventoId)
          .input('empresa_id', parseInt(empresaId))
          .query(`INSERT INTO evento_patrocinadores (evento_id, empresa_id) VALUES (@evento_id, @empresa_id)`);
      }

      // Registrar auspiciadores
      for (const empresaId of auspiciadoresList) {
        await transaction.request()
          .input('evento_id', sqlEventoId)
          .input('empresa_id', parseInt(empresaId))
          .query(`INSERT INTO evento_Auspisiadores (evento_id, empresa_id) VALUES (@evento_id, @empresa_id)`);
      }

      // Procesar imágenes
      let imagenesPromocionales = [];
      if (req.files && req.files.length > 0) {
        imagenesPromocionales = await processImages(req.files);
      }

      // Crear en MongoDB
      const eventoData = {
        sqlEventoId,
        titulo,
        descripcion: descripcion || '',
        fechaInicio: fechaInicioDate,
        fechaFinal: fechaFinalDate,
        locacion: locacionObj,
        tipoEvento,
        ongId: parseInt(ongId),
        capacidadMaxima: capacidadMaxima ? parseInt(capacidadMaxima) : null,
        inscripcionAbierta:  inscripcionAbiertaFlag,
        fechaLimiteInscripcion: fechaLimiteInscripcion ? new Date(fechaLimiteInscripcion) : null,
        imagenesPromocionales,
        estado,
        publico: estado === ESTADOS_EVENTO.PUBLICADO,
        activo: true,
        creadoPor: parseInt(ongId),
        empresasPatrocinadoras: patrocinadoresList.map(id => parseInt(id)),
        empresasAuspiciadoras: auspiciadoresList.map(id => parseInt(id)),
        metricas: {
          totalInscritos: 0,
          totalAsistentes: 0,
          porcentajeAsistencia: 0
        },
        participantes: [],
        historialEstados: [{
          estadoAnterior: null,
          estadoNuevo: estado,
          fecha: new Date(),
          motivo: 'Creación del evento',
          usuarioId: parseInt(ongId)
        }]
      };

      const nuevoEvento = new Evento(eventoData);
      await nuevoEvento.save();

      await transaction.commit();

      res.status(201).json({
        success: true,
        message: 'Evento creado exitosamente',
        evento: {
          id: nuevoEvento._id,
          sqlEventoId,
          titulo: nuevoEvento.titulo,
          estado: nuevoEvento.estado,
          fechaInicio: nuevoEvento.fechaInicio,
          totalImagenes: nuevoEvento.imagenesPromocionales.length,
          totalPatrocinadores: patrocinadoresList.length,
          totalAuspiciadores: auspiciadoresList.length
        }
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('💥 Error creando evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al crear evento'
    });
  }
};

// READ - Obtener todos los eventos
const getAllEvents = async (req, res) => {
  try {
    const { tipo, ciudad, estado = 'publicado', pagina = 1, limite = 10 } = req.query;

    const filtros = { 
      estado, 
      publico: true, 
      activo: true,
      fechaInicio: { $gte: new Date() }
    };
    
    if (tipo) filtros.tipoEvento = tipo;
    if (ciudad) filtros['locacion.ciudad'] = ciudad;

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const eventos = await Evento.find(filtros)
      .sort({ fechaInicio: 1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

    const total = await Evento.countDocuments(filtros);

    const pool = await poolPromise;
    const eventosConEmpresas = await Promise.all(eventos.map(async (evento) => {
      const patrocinadores = await pool.request()
        .input('evento_id', evento.sqlEventoId)
        .query(`
          SELECT e.id_usuario, e.nombre_empresa, u.nombre_usuario
          FROM evento_patrocinadores ep
          INNER JOIN empresas e ON ep.empresa_id = e.id_usuario
          INNER JOIN usuarios u ON e.id_usuario = u.id_usuario
          WHERE ep.evento_id = @evento_id
        `);

      const auspiciadores = await pool.request()
        .input('evento_id', evento.sqlEventoId)
        .query(`
          SELECT e.id_usuario, e.nombre_empresa, u.nombre_usuario
          FROM evento_Auspisiadores ea
          INNER JOIN empresas e ON ea.empresa_id = e.id_usuario
          INNER JOIN usuarios u ON e.id_usuario = u.id_usuario
          WHERE ea.evento_id = @evento_id
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
        empresasPatrocinadoras: patrocinadores.recordset,
        empresasAuspiciadoras: auspiciadores.recordset
      };
    }));

    res.json({
      success: true,
      eventos: eventosConEmpresas,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error obteniendo eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos'
    });
  }
};

// READ - Obtener evento por ID
const getEventById = async (req, res) => {
  try {
    const { eventoId } = req.params;
    
    // 1) Trae el evento como objeto plano
    const evento = await Evento.findById(eventoId).lean();
    if (!evento || !evento.activo) {
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    }

    /* ─────────────────────  IMÁGENES  ───────────────────── */

    // a)  Convierto TODAS las imágenes a data-URL (solo cabecera + base64)
    if (Array.isArray(evento.imagenesPromocionales) && evento.imagenesPromocionales.length) {
      // imagen principal = primera de la lista
      const primera = evento.imagenesPromocionales[0];
      evento.imagenPrincipal = {
        url: `data:${primera.mimeType};base64,${primera.datos.toString('base64')}`
      };

      // Galería: solo los campos necesarios + url
      evento.imagenesPromocionales = evento.imagenesPromocionales.map(img => ({
        _id:        img._id,
        nombre:     img.nombre,
        descripcion:img.descripcion,
        tipo:       img.tipo,
        url:        `data:${img.mimeType};base64,${img.datos.toString('base64')}`
      }));
    }

    /* ─────────────────────  DEMÁS DATOS  ───────────────────── */
    // 2) Consultas a SQL Server (igual que antes) …
    const pool = await poolPromise;

    // Patrocinadores
    const patrocinadoresResult = await pool.request()
      .input('evento_id', evento.sqlEventoId)
      .query(`
        SELECT e.id_usuario AS empresaID, e.nombre_empresa, u.nombre_usuario, u.correo_electronico
        FROM evento_patrocinadores ep
        INNER JOIN empresas e ON ep.empresa_id = e.id_usuario
        INNER JOIN usuarios u ON e.id_usuario = u.id_usuario
        WHERE ep.evento_id = @evento_id;
      `);

    // Auspiciadores
    const auspiciadoresResult = await pool.request()
      .input('evento_id', evento.sqlEventoId)
      .query(`
        SELECT e.id_usuario AS empresaID, e.nombre_empresa, u.nombre_usuario, u.correo_electronico
        FROM evento_Auspisiadores ea
        INNER JOIN empresas e ON ea.empresa_id = e.id_usuario
        INNER JOIN usuarios u ON e.id_usuario = u.id_usuario
        WHERE ea.evento_id = @evento_id;
      `);

    evento.empresasPatrocinadoras = patrocinadoresResult.recordset;
    evento.empresasAuspiciadoras  = auspiciadoresResult.recordset;

    /* ─── Mapear avatar Mongo para cada empresa ───────────────────────── */
    const idsPatro  = patrocinadoresResult.recordset.map(r => r.empresaID);
    const idsAuspi  = auspiciadoresResult.recordset .map(r => r.empresaID);
    const idsUnique = [...new Set([...idsPatro, ...idsAuspi])];

    const mongoAvatars = await User
      .find({ sqlUserId: { $in: idsUnique } })
      .select('sqlUserId avatar')
      .lean();

    const avatarMap = {};
    for (const u of mongoAvatars) {
      if (u.avatar && u.avatar.length) {
        // si siempre guardas jpeg, cámbialo aquí
        const mime = 'image/jpeg';
        avatarMap[u.sqlUserId] = `data:${mime};base64,${u.avatar.toString('base64')}`;
      }
    }

    /* Añade avatar a cada registro                                             */
    evento.empresasPatrocinadoras = patrocinadoresResult.recordset.map(r => ({
      ...r,
      avatar: avatarMap[r.empresaID] || null
    }));

    evento.empresasAuspiciadoras = auspiciadoresResult.recordset.map(r => ({
      ...r,
      avatar: avatarMap[r.empresaID] || null
    }));

    return res.json({ success: true, evento });
  } catch (err) {
    console.error('Error obteniendo evento:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener evento' });
  }
};

// READ - Obtener eventos de una ONG
const getOngEvents = async (req, res) => {
  try {
    const { ongId } = req.params;
    const { estado, tipo, pagina = 1, limite = 10 } = req.query;

    const filtros = { 
      ongId: parseInt(ongId),
      activo: true 
    };
    
    if (estado) filtros.estado = estado;
    if (tipo) filtros.tipoEvento = tipo;

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const eventos = await Evento.find(filtros)
      .sort({ fechaInicio: -1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

    const total = await Evento.countDocuments(filtros);

    const eventosConMiniaturas = eventos.map(evento => {
      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        const imagenPrincipal = evento.imagenesPromocionales[0];
        evento.imagenPrincipal = {
          _id: imagenPrincipal._id,
          nombre: imagenPrincipal.nombre,
          url: `data:${imagenPrincipal.mimeType};base64,${imagenPrincipal.datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;
      return evento;
    });

    res.json({
      success: true,
      eventos: eventosConMiniaturas,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error obteniendo eventos de ONG:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos'
    });
  }
};




// UPDATE - Actualizar evento
const updateEvent = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.body;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId, 10)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para editar este evento'
      });
    }

    // Campos que permitimos actualizar
    const camposPermitidos = [
      'titulo', 'descripcion',
      'fechaInicio', 'fechaFinal', 'fechaLimiteInscripcion',
      'locacion', 'tipoEvento', 'capacidadMaxima',
      'inscripcionAbierta', 'estado'
    ];

    let huboCambios = false;

    camposPermitidos.forEach(campo => {
      const val = req.body[campo];
      if (val !== undefined) {
        switch (campo) {
          case 'fechaInicio':
          case 'fechaFinal':
          case 'fechaLimiteInscripcion':
            evento[campo] = val ? new Date(val) : null;
            break;

          case 'locacion':
            if (typeof val === 'string') {
              evento.locacion.direccion = val;
            } else {
              evento.locacion = { ...evento.locacion, ...val };
            }
            break;

          case 'inscripcionAbierta':
            // Convertir "true"/"false" o booleanos reales
            evento.inscripcionAbierta = (val === true || val === 'true');
            break;

          default:
            evento[campo] = val;
        }
        huboCambios = true;
      }
    });

    // Procesar nuevas imágenes si vienen
    if (req.files && req.files.length > 0) {
      if (evento.imagenesPromocionales.length + req.files.length > 10) {
        return res.status(400).json({
          success: false,
          error: 'Máximo 10 imágenes por evento'
        });
      }
      const nuevas = await processImages(req.files);
      evento.imagenesPromocionales.push(...nuevas);
      huboCambios = true;
    }

    if (!huboCambios) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron cambios para actualizar'
      });
    }

    await evento.save();

    // (Opcional) Sincronizar algunos campos con SQL Server
    if (evento.sqlEventoId) {
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('EventoID', evento.sqlEventoId)
          .input('Tittulo', evento.titulo)
          .input('Descripcion', evento.descripcion)
          .input('F_Inicio', evento.fechaInicio)
          .input('F_final', evento.fechaFinal)
          .input('Locacion', evento.locacion.direccion)
          .input('Tipo_evento', evento.tipoEvento)
          .query(`
            UPDATE Eventos
              SET Tittulo     = @Tittulo,
                  Descripcion = @Descripcion,
                  F_Inicio    = @F_Inicio,
                  F_final     = @F_final,
                  Locacion    = @Locacion,
                  Tipo_evento = @Tipo_evento
            WHERE EventoID = @EventoID
          `);
      } catch (err) {
        console.error('Error SQL sync:', err);
      }
    }

    return res.json({
      success: true,
      message: 'Evento actualizado exitosamente',
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        estado: evento.estado,
        totalImagenes: evento.imagenesPromocionales.length
      }
    });

  } catch (error) {
    console.error('Error actualizando evento:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al actualizar evento'
    });
  }
};

// DELETE - Eliminar evento
const deleteEvent = async (req, res) => {
  try {
    const { eventoId } = req.params; 
    const { ongId } = req.body;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para eliminar este evento'
      });
    }

    // Verificar participantes
    if (evento.participantes.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'No se puede eliminar un evento con participantes registrados',
        sugerencia: 'Use el estado "cancelado" para cancelar el evento'
      });
    }

    // Eliminar de SQL Server
    if (evento.sqlEventoId) {
      try {
        const pool = await poolPromise;
        const transaction = pool.transaction();
        await transaction.begin();

        await transaction.request()
          .input('evento_id', evento.sqlEventoId)
          .query('DELETE FROM evento_patrocinadores WHERE evento_id = @evento_id');

        await transaction.request()
          .input('evento_id', evento.sqlEventoId)
          .query('DELETE FROM evento_Auspisiadores WHERE evento_id = @evento_id');

        await transaction.request()
          .input('EventoID', evento.sqlEventoId)
          .query('DELETE FROM Eventos WHERE EventoID = @EventoID');

        await transaction.commit();
      } catch (sqlError) {
        console.error('Error eliminando de SQL Server:', sqlError);
      }
    }

    // Soft delete en MongoDB
    evento.activo = false;
    evento.estado = 'cancelado';
    await evento.save();

    res.json({
      success: true,
      message: 'Evento eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar evento'
    });
  }
};

// Registrar participante
const registerParticipant = async (req, res) => {
  const { eventoId } = req.params;
  const { integranteId, tipoParticipante = 'participante' } = req.body;

  const pool = await poolPromise;
  const transaction = pool.transaction();

  try {
    
    const evento = await Evento.findById(eventoId);

    if (!evento) {
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    }

    if (!evento.inscripcionAbierta) {
      return res
        .status(403)
        .json({ success: false, error: 'Inscripciones cerradas' });
    }


    // 2. Iniciar transacción SQL
    await transaction.begin();

    // 3. Registrar en SQL Server PRIMERO
    await transaction.request()
      .input('evento_id', evento.sqlEventoId)
      .input('integrante_externo_id', integranteId)
      .input('tipo_participante', tipoParticipante)
      .query(`
        INSERT INTO evento_integrantes_externos 
        (evento_id, integrante_externo_id, asistencia, tipo_participante)
        VALUES (@evento_id, @integrante_externo_id, 0, @tipo_participante)
      `);

    // 4. Registrar en MongoDB
    await evento.agregarParticipante({
      integranteId: parseInt(integranteId),
      tipoParticipante
    });

    // 5. Confirmar transacción
    await transaction.commit();

    res.json({
      success: true,
      message: 'Participante registrado exitosamente en ambas bases de datos',
      totalParticipantes: evento.participantes.length
    });

  } catch (error) {
    // Rollback si algo falla
    await transaction.rollback();
    
    console.error('Error registrando participante:', error);
    res.status(500).json({
      success: false,
      error: 'Error al registrar participante'
    });
  }
};

// Registrar asistencia
const registerAttendance = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { integranteId, asistencia, ongId } = req.body;

    if (typeof asistencia !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'El campo asistencia debe ser true o false'
      });
    }

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para registrar asistencia en este evento'
      });
    }

    await evento.registrarAsistencia(integranteId, asistencia);

    // Sincronizar con SQL Server
    if (evento.sqlEventoId) {
      try {
        const pool = await poolPromise;
        await pool.request()
          .input('evento_id', evento.sqlEventoId)
          .input('integrante_id', integranteId)
          .input('asistencia', asistencia ? 1 : 0)
          .query(`
            UPDATE evento_integrantes_externos 
            SET asistencia = @asistencia
            WHERE evento_id = @evento_id AND integrante_externo_id = @integrante_id
          `);
      } catch (sqlError) {
        console.error('Error sincronizando asistencia:', sqlError);
      }
    }

    res.json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      metricas: {
        totalAsistentes: evento.metricas.totalAsistentes,
        porcentajeAsistencia: evento.metricas.porcentajeAsistencia
      }
    });

  } catch (error) {
    console.error('Error registrando asistencia:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al registrar asistencia'
    });
  }
};

// Eliminar imagen del evento
const deleteEventImage = async (req, res) => {
  try {
    const { eventoId, imagenId } = req.params;
    const { ongId } = req.body;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para eliminar imágenes de este evento'
      });
    }

    const imagenIndex = evento.imagenesPromocionales.findIndex(
      img => img._id.toString() === imagenId
    );

    if (imagenIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Imagen no encontrada'
      });
    }

    evento.imagenesPromocionales.splice(imagenIndex, 1);
    await evento.save();

    res.json({
      success: true,
      message: 'Imagen eliminada exitosamente',
      totalImagenes: evento.imagenesPromocionales.length
    });

  } catch (error) {
    console.error('Error eliminando imagen:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar imagen'
    });
  }
};

// Estadísticas del evento

const getEventStatistics = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.query;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver estadísticas de este evento'
      });
    }

    // Calcular días desde el evento
    const ahora = new Date();
    const diasHastaEvento = Math.ceil((evento.fechaInicio - ahora) / (1000 * 60 * 60 * 24));
    const eventoEsPasado = diasHastaEvento < 0;
    const diasDesdeEvento = eventoEsPasado ? Math.abs(diasHastaEvento) : 0;

    // KPIs de Participación
    const participantesPorTipo = evento.participantes.reduce((acc, p) => {
      acc[p.tipoParticipante] = (acc[p.tipoParticipante] || 0) + 1;
      return acc;
    }, {});

    const participantesConAsistencia = evento.participantes.filter(p => p.asistencia !== null);
    const participantesAsistieron = evento.participantes.filter(p => p.asistencia === true);
    const participantesNoAsistieron = evento.participantes.filter(p => p.asistencia === false);

    // KPIs de Tiempo e Inscripciones
    const fechaCreacion = evento.createdAt;
    const diasParaInscripcion = evento.fechaLimiteInscripcion ? 
      Math.ceil((evento.fechaLimiteInscripcion - ahora) / (1000 * 60 * 60 * 24)) : null;

    // Calcular tasa de inscripción por día (si el evento está publicado)
    let tasaInscripcionPorDia = 0;
    if (evento.estado === 'publicado' && fechaCreacion) {
      const diasDesdePublicacion = Math.max(1, Math.ceil((ahora - fechaCreacion) / (1000 * 60 * 60 * 24)));
      tasaInscripcionPorDia = evento.metricas.totalInscritos / diasDesdePublicacion;
    }

    // KPIs de Capacidad y Demanda
    const porcentajeCapacidad = evento.capacidadMaxima ? 
      Math.round((evento.metricas.totalInscritos / evento.capacidadMaxima) * 100) : null;
    
    const estaLleno = evento.capacidadMaxima ? 
      evento.metricas.totalInscritos >= evento.capacidadMaxima : false;

    // KPIs de Engagement y Calidad
    const participantesConComentarios = evento.participantes.filter(p => p.comentarios && p.comentarios.trim().length > 0);
    const porcentajeEngagement = evento.participantes.length > 0 ? 
      Math.round((participantesConComentarios.length / evento.participantes.length) * 100) : 0;

    // KPIs de Contenido y Promoción
    const imagenesPorTipo = evento.imagenesPromocionales.reduce((acc, img) => {
      acc[img.tipo] = (acc[img.tipo] || 0) + 1;
      return acc;
    }, {});

    const tieneImagenPortada = evento.imagenesPromocionales.some(img => img.tipo === 'portada');
    const tieneImagenesPromocionales = evento.imagenesPromocionales.some(img => img.tipo === 'promocional');

    // KPIs de Soporte Empresarial
    const totalEmpresas = evento.empresasPatrocinadoras.length + evento.empresasAuspiciadoras.length;
    const tieneApoyoEmpresarial = totalEmpresas > 0;

    // Proyecciones (solo para eventos futuros)
    let proyecciones = null;
    if (!eventoEsPasado && tasaInscripcionPorDia > 0 && diasHastaEvento > 0) {
      const inscripcionesProyectadas = Math.round(
        evento.metricas.totalInscritos + (tasaInscripcionPorDia * diasHastaEvento)
      );
      const proyeccionCapacidad = evento.capacidadMaxima ? 
        Math.min(inscripcionesProyectadas, evento.capacidadMaxima) : inscripcionesProyectadas;
      
      proyecciones = {
        inscripcionesProyectadas: proyeccionCapacidad,
        probabilidadLlenarCapacidad: evento.capacidadMaxima ? 
          Math.min(100, Math.round((inscripcionesProyectadas / evento.capacidadMaxima) * 100)) : 100,
        diasParaLlenar: evento.capacidadMaxima && tasaInscripcionPorDia > 0 ? 
          Math.ceil((evento.capacidadMaxima - evento.metricas.totalInscritos) / tasaInscripcionPorDia) : null
      };
    }

    // Calcular score de éxito del evento
    let scoreExito = 0;
    let factoresScore = [];

    // Factor 1: Asistencia (30%)
    if (evento.metricas.porcentajeAsistencia > 0) {
      const scoreAsistencia = Math.min(30, (evento.metricas.porcentajeAsistencia / 100) * 30);
      scoreExito += scoreAsistencia;
      factoresScore.push({ factor: 'Asistencia', puntos: scoreAsistencia, maximo: 30 });
    }

    // Factor 2: Capacidad utilizada (25%)
    if (porcentajeCapacidad !== null) {
      const scoreCapacidad = Math.min(25, (porcentajeCapacidad / 100) * 25);
      scoreExito += scoreCapacidad;
      factoresScore.push({ factor: 'Capacidad', puntos: scoreCapacidad, maximo: 25 });
    }

    // Factor 3: Engagement (20%)
    const scoreEngagement = (porcentajeEngagement / 100) * 20;
    scoreExito += scoreEngagement;
    factoresScore.push({ factor: 'Engagement', puntos: scoreEngagement, maximo: 20 });

    // Factor 4: Contenido promocional (15%)
    let scoreContenido = 0;
    if (tieneImagenPortada) scoreContenido += 7.5;
    if (tieneImagenesPromocionales) scoreContenido += 7.5;
    scoreExito += scoreContenido;
    factoresScore.push({ factor: 'Contenido', puntos: scoreContenido, maximo: 15 });

    // Factor 5: Apoyo empresarial (10%)
    const scoreEmpresas = tieneApoyoEmpresarial ? 10 : 0;
    scoreExito += scoreEmpresas;
    factoresScore.push({ factor: 'Apoyo Empresarial', puntos: scoreEmpresas, maximo: 10 });

    scoreExito = Math.round(scoreExito);

    // Determinar nivel de éxito
    let nivelExito = 'Bajo';
    let colorNivel = '#ef4444'; // rojo
    if (scoreExito >= 80) {
      nivelExito = 'Excelente';
      colorNivel = '#22c55e'; // verde
    } else if (scoreExito >= 60) {
      nivelExito = 'Bueno';
      colorNivel = '#3b82f6'; // azul
    } else if (scoreExito >= 40) {
      nivelExito = 'Regular';
      colorNivel = '#f59e0b'; // amarillo
    }

    const estadisticas = {
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        fechaInicio: evento.fechaInicio,
        fechaFinal: evento.fechaFinal,
        estado: evento.estado,
        tipoEvento: evento.tipoEvento,
        categoria: evento.categoria
      },

      // KPIs Principales
      kpisGenerales: {
        scoreExito: {
          puntuacion: scoreExito,
          nivel: nivelExito,
          color: colorNivel,
          factores: factoresScore
        },
        diasHastaEvento: eventoEsPasado ? null : diasHastaEvento,
        diasDesdeEvento: eventoEsPasado ? diasDesdeEvento : null,
        esPasado: eventoEsPasado
      },

      // KPIs de Participación
      participacion: {
        totalInscritos: evento.metricas.totalInscritos,
        totalAsistentes: evento.metricas.totalAsistentes,
        porcentajeAsistencia: evento.metricas.porcentajeAsistencia,
        participantesPendientes: evento.participantes.length - participantesConAsistencia.length,
        participantesNoAsistieron: participantesNoAsistieron.length,
        participantesPorTipo,
        
        // Métricas de calidad
        participantesConComentarios: participantesConComentarios.length,
        porcentajeEngagement,
        
        // Estado de inscripciones
        inscripcionesAbiertas: evento.inscripcionAbierta,
        diasParaInscripcion,
        fechaLimiteInscripcion: evento.fechaLimiteInscripcion
      },

      // KPIs de Capacidad
      capacidad: {
        capacidadMaxima: evento.capacidadMaxima,
        espaciosDisponibles: evento.capacidadMaxima ? 
          Math.max(0, evento.capacidadMaxima - evento.metricas.totalInscritos) : null,
        porcentajeCapacidad,
        estaLleno,
        tasaInscripcionPorDia: Math.round(tasaInscripcionPorDia * 100) / 100
      },

      // Proyecciones (solo para eventos futuros)
      proyecciones,

      // KPIs de Contenido y Promoción
      contenido: {
        totalImagenes: evento.imagenesPromocionales.length,
        imagenesPorTipo,
        tieneImagenPortada,
        tieneImagenesPromocionales,
        scoreContenido: Math.round((scoreContenido / 15) * 100)
      },

      // KPIs Empresariales
      empresas: {
        totalPatrocinadoras: evento.empresasPatrocinadoras.length,
        totalAuspiciadoras: evento.empresasAuspiciadoras.length,
        totalEmpresas,
        tieneApoyoEmpresarial,
        scoreApoyoEmpresarial: scoreEmpresas
      },

      // KPIs de Tiempo
      tiempo: {
        fechaCreacion,
        diasDesdeCreacion: Math.ceil((ahora - fechaCreacion) / (1000 * 60 * 60 * 24)),
        estadoActual: evento.estado,
        historialCambios: evento.historialEstados?.length || 0
      },

      // Recomendaciones basadas en KPIs
      recomendaciones: generarRecomendaciones({
        evento,
        scoreExito,
        porcentajeCapacidad,
        tasaInscripcionPorDia,
        diasHastaEvento,
        eventoEsPasado,
        tieneImagenPortada,
        tieneImagenesPromocionales,
        tieneApoyoEmpresarial
      })
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


// Función auxiliar para generar recomendaciones
const generarRecomendaciones = (datos) => {
  const recomendaciones = [];
  const { evento, scoreExito, porcentajeCapacidad, tasaInscripcionPorDia, 
          diasHastaEvento, eventoEsPasado, tieneImagenPortada, 
          tieneImagenesPromocionales, tieneApoyoEmpresarial } = datos;

  // Recomendaciones para eventos futuros
  if (!eventoEsPasado) {
    if (porcentajeCapacidad !== null && porcentajeCapacidad < 50 && diasHastaEvento > 7) {
      recomendaciones.push({
        tipo: 'marketing',
        prioridad: 'alta',
        mensaje: 'Intensificar promoción del evento - ocupación actual menor al 50%',
        accion: 'Revisar estrategia de marketing y canales de difusión'
      });
    }

    if (tasaInscripcionPorDia < 1 && diasHastaEvento > 14) {
      recomendaciones.push({
        tipo: 'promocion',
        prioridad: 'media',
        mensaje: 'Baja tasa de inscripciones diarias',
        accion: 'Considerar incentivos o mejoras en la propuesta de valor'
      });
    }

    if (!tieneImagenPortada) {
      recomendaciones.push({
        tipo: 'contenido',
        prioridad: 'media',
        mensaje: 'Agregar imagen de portada para mejor presentación',
        accion: 'Subir una imagen de portada atractiva'
      });
    }

    if (!tieneApoyoEmpresarial && diasHastaEvento > 21) {
      recomendaciones.push({
        tipo: 'patrocinios',
        prioridad: 'baja',
        mensaje: 'Buscar patrocinadores o auspiciadores',
        accion: 'Contactar empresas para apoyo financiero o logístico'
      });
    }
  }

  // Recomendaciones para eventos pasados
  if (eventoEsPasado) {
    if (evento.metricas.porcentajeAsistencia < 70) {
      recomendaciones.push({
        tipo: 'mejora',
        prioridad: 'alta',
        mensaje: 'Analizar causas de baja asistencia para futuros eventos',
        accion: 'Encuestar a participantes registrados que no asistieron'
      });
    }

    if (scoreExito < 60) {
      recomendaciones.push({
        tipo: 'evaluacion',
        prioridad: 'alta',
        mensaje: 'Realizar análisis post-evento para identificar mejoras',
        accion: 'Revisar todos los factores que impactaron el score de éxito'
      });
    }
  }

  // Recomendaciones generales
  if (evento.participantes.length > 0) {
    const sinComentarios = evento.participantes.filter(p => !p.comentarios || p.comentarios.trim() === '').length;
    if (sinComentarios > evento.participantes.length * 0.7) {
      recomendaciones.push({
        tipo: 'engagement',
        prioridad: 'baja',
        mensaje: 'Fomentar feedback de participantes',
        accion: 'Solicitar comentarios y sugerencias activamente'
      });
    }
  }

  return recomendaciones;
};

// Función adicional para KPIs comparativos entre eventos de la ONG
const getOngEventKPIs = async (req, res) => {
  try {
    const { ongId } = req.params;
    const { periodo = '6m' } = req.query; // 6m = 6 meses, 1y = 1 año, etc.

    // Calcular fecha de inicio según el período
    const ahora = new Date();
    let fechaInicio = new Date();
    
    switch (periodo) {
      case '1m':
        fechaInicio.setMonth(ahora.getMonth() - 1);
        break;
      case '3m':
        fechaInicio.setMonth(ahora.getMonth() - 3);
        break;
      case '6m':
        fechaInicio.setMonth(ahora.getMonth() - 6);
        break;
      case '1y':
        fechaInicio.setFullYear(ahora.getFullYear() - 1);
        break;
      default:
        fechaInicio.setMonth(ahora.getMonth() - 6);
    }

    const eventos = await Evento.find({
      ongId: parseInt(ongId),
      activo: true,
      fechaInicio: { $gte: fechaInicio },
      estado: { $in: ['finalizado', 'en_curso', 'publicado'] }
    }).sort({ fechaInicio: -1 });

    // Calcular KPIs agregados
    const kpisComparativos = {
      resumen: {
        totalEventos: eventos.length,
        periodo,
        fechaInicio,
        fechaFin: ahora
      },
      
      promedios: {
        asistenciaPromedio: eventos.length > 0 ? 
          Math.round(eventos.reduce((sum, e) => sum + e.metricas.porcentajeAsistencia, 0) / eventos.length) : 0,
        inscritosPromedio: eventos.length > 0 ?
          Math.round(eventos.reduce((sum, e) => sum + e.metricas.totalInscritos, 0) / eventos.length) : 0,
        capacidadPromedio: eventos.filter(e => e.capacidadMaxima).length > 0 ?
          Math.round(eventos.filter(e => e.capacidadMaxima)
            .reduce((sum, e) => sum + (e.metricas.totalInscritos / e.capacidadMaxima * 100), 0) / 
            eventos.filter(e => e.capacidadMaxima).length) : 0
      },
      
      mejoresEventos: eventos
        .filter(e => e.estado === 'finalizado')
        .sort((a, b) => b.metricas.porcentajeAsistencia - a.metricas.porcentajeAsistencia)
        .slice(0, 3)
        .map(e => ({
          id: e._id,
          titulo: e.titulo,
          porcentajeAsistencia: e.metricas.porcentajeAsistencia,
          totalInscritos: e.metricas.totalInscritos,
          fechaInicio: e.fechaInicio
        })),
        
      tendencias: {
        eventosPorMes: calcularEventosPorMes(eventos),
        tiposEventoMasExitosos: calcularTiposExitosos(eventos)
      }
    };

    res.json({
      success: true,
      kpisComparativos
    });

  } catch (error) {
    console.error('Error obteniendo KPIs comparativos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener KPIs comparativos'
    });
  }
};

// Funciones auxiliares para KPIs comparativos
const calcularEventosPorMes = (eventos) => {
  const eventosPorMes = {};
  eventos.forEach(evento => {
    const mes = evento.fechaInicio.toISOString().substring(0, 7); // YYYY-MM
    if (!eventosPorMes[mes]) {
      eventosPorMes[mes] = { total: 0, inscripciones: 0, asistencia: 0 };
    }
    eventosPorMes[mes].total++;
    eventosPorMes[mes].inscripciones += evento.metricas.totalInscritos;
    eventosPorMes[mes].asistencia += evento.metricas.totalAsistentes;
  });
  return eventosPorMes;
};

const calcularTiposExitosos = (eventos) => {
  const tiposEventos = {};
  eventos.forEach(evento => {
    if (!tiposEventos[evento.tipoEvento]) {
      tiposEventos[evento.tipoEvento] = {
        total: 0,
        asistenciaPromedio: 0,
        inscripcionesTotal: 0
      };
    }
    tiposEventos[evento.tipoEvento].total++;
    tiposEventos[evento.tipoEvento].asistenciaPromedio += evento.metricas.porcentajeAsistencia;
    tiposEventos[evento.tipoEvento].inscripcionesTotal += evento.metricas.totalInscritos;
  });
  
  // Calcular promedios
  Object.keys(tiposEventos).forEach(tipo => {
    tiposEventos[tipo].asistenciaPromedio = Math.round(
      tiposEventos[tipo].asistenciaPromedio / tiposEventos[tipo].total
    );
  });
  
  return tiposEventos;
};

module.exports = {
  getEventStatistics,
  getOngEventKPIs
};








// Obtener empresas disponibles
const getAvailableCompanies = async (req, res) => {
  try {
    const empresas = await obtenerEmpresas();
    res.json({
      success: true,
      empresas: empresas.map(empresa => ({
        id:           empresa.empresaID,
        nombre:       empresa.nombre_empresa,
        correo:       empresa.correo,
        nombreUsuario: empresa.nombre_usuario
      }))
    });
  } catch (error) {
    console.error('Error obteniendo empresas en getAvailableCompanies():', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener empresas'
    });
  }
};

async function obtenerEmpresas() {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`
        SELECT 
          e.id_usuario        AS empresaID,
          e.nombre_empresa    AS nombre_empresa,
          u.correo_electronico AS correo,
          u.nombre_usuario    AS nombre_usuario
        FROM empresas e
        INNER JOIN usuarios u
          ON e.id_usuario = u.id_usuario
        WHERE u.activo = 1
      `);
    // recordset es un array de filas
    return result.recordset;
  } catch (err) {
    console.error('Error en obtenerEmpresas():', err);
    // Relanzamos para que el controlador capture el error
    throw err;
  }
}

// Buscar eventos por texto
const searchEvents = async (req, res) => {
  try {
    const { termino } = req.params;
    const { tipo, ciudad, fechaDesde, fechaHasta, limite = 20 } = req.query;
    
    console.log(`🔍 Búsqueda de eventos: "${termino}"`);
    
    const query = {
      activo: true,
      publico: true,
      estado: 'publicado',
      $or: [
        { titulo: { $regex: termino, $options: 'i' } },
        { descripcion: { $regex: termino, $options: 'i' } },
        { tags: { $in: [new RegExp(termino, 'i')] } }
      ]
    };
    
    if (tipo) query.tipoEvento = tipo;
    if (ciudad) query['locacion.ciudad'] = ciudad;
    if (fechaDesde || fechaHasta) {
      query.fechaInicio = {};
      if (fechaDesde) query.fechaInicio.$gte = new Date(fechaDesde);
      if (fechaHasta) query.fechaInicio.$lte = new Date(fechaHasta);
    }
    
    const eventos = await Evento.find(query)
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();
    
    const eventosConMiniaturas = eventos.map(evento => {
      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        evento.imagenPrincipal = {
          url: `data:${evento.imagenesPromocionales[0].mimeType};base64,${evento.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;
      return evento;
    });
    
    res.json({
      success: true,
      termino,
      eventos: eventosConMiniaturas,
      total: eventosConMiniaturas.length,
      filtrosAplicados: { tipo, ciudad, fechaDesde, fechaHasta }
    });
  } catch (error) {
    console.error('Error buscando eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Error en la búsqueda de eventos'
    });
  }
};

// Obtener eventos próximos
const getUpcomingEvents = async (req, res) => {
  try {
    const { dias = 30 } = req.query;
    
    console.log(`📅 Obteniendo eventos próximos (${dias} días)`);
    
    const eventos = await Evento.eventosProximos(parseInt(dias));
    
    const eventosConMiniaturas = eventos.map(evento => {
      const eventoObj = evento.toObject();
      if (eventoObj.imagenesPromocionales && eventoObj.imagenesPromocionales.length > 0) {
        eventoObj.imagenPrincipal = {
          url: `data:${eventoObj.imagenesPromocionales[0].mimeType};base64,${eventoObj.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete eventoObj.imagenesPromocionales;
      return eventoObj;
    });
    
    res.json({
      success: true,
      eventos: eventosConMiniaturas,
      diasConsiderados: parseInt(dias),
      total: eventosConMiniaturas.length
    });
  } catch (error) {
    console.error('Error obteniendo eventos próximos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos próximos'
    });
  }
};

// Obtener eventos por tipo
const getEventsByType = async (req, res) => {
  try {
    const { tipoEvento } = req.params;
    const { ciudad, limite = 10 } = req.query;
    
    console.log(`🏷️ Obteniendo eventos de tipo: ${tipoEvento}`);
    
    const query = {
      tipoEvento,
      activo: true,
      publico: true,
      estado: 'publicado',
      fechaInicio: { $gte: new Date() }
    };
    
    if (ciudad) query['locacion.ciudad'] = ciudad;
    
    const eventos = await Evento.find(query)
      .sort({ fechaInicio: 1 })
      .limit(parseInt(limite))
      .lean();
    
    const eventosConMiniaturas = eventos.map(evento => {
      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        evento.imagenPrincipal = {
          url: `data:${evento.imagenesPromocionales[0].mimeType};base64,${evento.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;
      return evento;
    });
    
    res.json({
      success: true,
      tipoEvento,
      eventos: eventosConMiniaturas,
      total: eventosConMiniaturas.length
    });
  } catch (error) {
    console.error('Error obteniendo eventos por tipo:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos por tipo'
    });
  }
};

// Obtener participantes del evento
const getEventParticipants = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.query;
    
    const evento = await Evento.findById(eventoId);
    
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }
    
    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver participantes de este evento'
      });
    }
    
    res.json({
      success: true,
      participantes: evento.participantes,
      totalParticipantes: evento.participantes.length,
      metricas: evento.metricas
    });
  } catch (error) {
    console.error('Error obteniendo participantes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener participantes'
    });
  }
};

// Estadísticas generales del sistema
const getSystemStatistics = async (req, res) => {
  try {
    const stats = await Evento.aggregate([
      {
        $group: {
          _id: null,
          totalEventos: { $sum: 1 },
          eventosActivos: {
            $sum: { $cond: [{ $eq: ['$estado', 'publicado'] }, 1, 0] }
          },
          totalParticipantes: { $sum: '$metricas.totalInscritos' },
          totalImagenes: { $sum: { $size: '$imagenesPromocionales' } }
        }
      }
    ]);
    
    const eventosPorTipo = await Evento.aggregate([
      { $match: { activo: true, estado: 'publicado' } },
      { $group: { _id: '$tipoEvento', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      estadisticas: stats[0] || {
        totalEventos: 0,
        eventosActivos: 0,
        totalParticipantes: 0,
        totalImagenes: 0
      },
      eventosPorTipo,
      fecha: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas del sistema:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas del sistema'
    });
  }
};

// ================ NUEVAS FUNCIONES ================

// Cambiar estado del evento
const changeEventStatus = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { nuevoEstado, ongId, motivo } = req.body;

    if (!Object.values(ESTADOS_EVENTO).includes(nuevoEstado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido',
        estadosValidos: Object.values(ESTADOS_EVENTO)
      });
    }

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para cambiar el estado de este evento'
      });
    }

    // Validar transición
    const estadoActual = evento.estado;
    const transicionesPermitidas = TRANSICIONES_VALIDAS[estadoActual] || [];
    
    if (!transicionesPermitidas.includes(nuevoEstado)) {
      return res.status(400).json({
        success: false,
        error: `No se puede cambiar de "${estadoActual}" a "${nuevoEstado}"`,
        transicionesPermitidas
      });
    }

    // Validaciones específicas
    const validacionesEspecificas = await validarCambioEstado(evento, nuevoEstado);
    if (!validacionesEspecificas.valido) {
      return res.status(400).json({
        success: false,
        error: validacionesEspecificas.error
      });
    }

    // Actualizar estado
    const estadoAnterior = evento.estado;
    evento.estado = nuevoEstado;
    
    if (!evento.historialEstados) {
      evento.historialEstados = [];
    }
    
    evento.historialEstados.push({
      estadoAnterior,
      estadoNuevo: nuevoEstado,
      fecha: new Date(),
      motivo: motivo || `Cambio de ${estadoAnterior} a ${nuevoEstado}`,
      usuarioId: parseInt(ongId)
    });

    await ejecutarAccionesEstado(evento, nuevoEstado);
    await evento.save();

    res.json({
      success: true,
      message: `Estado cambiado exitosamente de "${estadoAnterior}" a "${nuevoEstado}"`,
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        estadoAnterior,
        estadoActual: nuevoEstado,
        fecha: new Date(),
        publico: evento.publico,
        inscripcionAbierta: evento.inscripcionAbierta
      }
    });

  } catch (error) {
    console.error('Error cambiando estado del evento:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar estado del evento'
    });
  }
};

// Obtener eventos por estado
const getEventsByStatus = async (req, res) => {
  try {
    const { estado } = req.params;
    const { ongId, pagina = 1, limite = 10 } = req.query;

    if (!Object.values(ESTADOS_EVENTO).includes(estado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido',
        estadosValidos: Object.values(ESTADOS_EVENTO)
      });
    }

    const filtros = { 
      estado,
      activo: true 
    };
    
    if (ongId) {
      filtros.ongId = parseInt(ongId);
    }

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const eventos = await Evento.find(filtros)
      .sort({ fechaInicio: -1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

    const total = await Evento.countDocuments(filtros);

    const eventosConMiniaturas = eventos.map(evento => {
      if (evento.imagenesPromocionales && evento.imagenesPromocionales.length > 0) {
        evento.imagenPrincipal = {
          url: `data:${evento.imagenesPromocionales[0].mimeType};base64,${evento.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete evento.imagenesPromocionales;
      return evento;
    });

    res.json({
      success: true,
      estado,
      eventos: eventosConMiniaturas,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error obteniendo eventos por estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener eventos por estado'
    });
  }
};

// Estadísticas de estados
const getStatusStatistics = async (req, res) => {
  try {
    const { ongId } = req.query;

    const filtros = { activo: true };
    if (ongId) {
      filtros.ongId = parseInt(ongId);
    }

    const estadisticas = await Evento.aggregate([
      { $match: filtros },
      {
        $group: {
          _id: '$estado',
          count: { $sum: 1 },
          ultimaActualizacion: { $max: '$updatedAt' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const resultados = {};
    Object.values(ESTADOS_EVENTO).forEach(estado => {
      resultados[estado] = 0;
    });

    estadisticas.forEach(stat => {
      resultados[stat._id] = stat.count;
    });

    res.json({
      success: true,
      estadisticas: resultados,
      total: Object.values(resultados).reduce((sum, count) => sum + count, 0),
      fecha: new Date()
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas de estados:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas de estados'
    });
  }
};

// Eventos de una empresa
// Obtener eventos de una empresa
// Obtener eventos de una empresa
const getCompanyEvents = async (req, res) => {
  try {
    const { empresaId } = req.params;
    const { tipo = 'todos', estado, limite = 10 } = req.query;
    const pool = await poolPromise;
    let eventos = [];

    // 1) Patrocinados
    if (tipo === 'patrocinador' || tipo === 'todos') {
      const { recordset: patro } = await pool.request()
        .input('empresaId', parseInt(empresaId, 10))
        .query(`
          SELECT 
            e.EventoID,
            e.Tittulo,
            e.F_Inicio,
            e.Locacion,
            'patrocinador' AS tipoParticipacion
          FROM evento_patrocinadores ep
          INNER JOIN Eventos e
            ON ep.evento_id = e.EventoID
          WHERE ep.empresa_id = @empresaId
        `);
      eventos.push(...patro);
    }

    // 2) Auspiciados
    if (tipo === 'auspiciador' || tipo === 'todos') {
      const { recordset: auspi } = await pool.request()
        .input('empresaId', parseInt(empresaId, 10))
        .query(`
          SELECT
            e.EventoID,
            e.Tittulo,
            e.F_Inicio,
            e.Locacion,
            'auspiciador' AS tipoParticipacion
          FROM evento_Auspisiadores ea
          INNER JOIN Eventos e
            ON ea.evento_id = e.EventoID
          WHERE ea.empresa_id = @empresaId
        `);
      eventos.push(...auspi);
    }

    // 3) Cruzar con Mongo
    const sqlIDs = eventos.map(e => e.EventoID);
    const filtros = { sqlEventoId: { $in: sqlIDs }, activo: true };
    if (estado) filtros.estado = estado;

    const eventosMongo = await Evento.find(filtros)
      .limit(parseInt(limite, 10))
      .lean();

    // 4) Combinar metadatos SQL + Mongo
    const combinados = eventosMongo.map(ev => {
      const sql = eventos.find(e => e.EventoID === ev.sqlEventoId);
      return {
        ...ev,
        tipoParticipacion: sql.tipoParticipacion,
        // si quieres también exponer F_Inicio y Locacion:
        fechaInicio: sql.F_Inicio,
        locacionSQL: sql.Locacion
      };
    });

    res.json({
      success: true,
      empresaId: parseInt(empresaId, 10),
      tipoConsultado: tipo,
      eventos: combinados,
      total: combinados.length
    });

  } catch (err) {
    console.error('Error obteniendo eventos de empresa:', err);
    res.status(500).json({ success: false, error: 'Error al obtener eventos de la empresa' });
  }
};



// Eventos de participación de un integrante
const getUserParticipationEvents = async (req, res) => {
  try {
    const { integranteId } = req.params;
    const { estado, conAsistencia, limite = 10 } = req.query;

    // 1) Construir consulta a SQL Server sólo con las columnas existentes
    const pool = await poolPromise;
    let query = `
      SELECT 
        e.EventoID, 
        e.Tittulo, 
        e.F_Inicio, 
        e.Locacion, 
        eie.asistencia
      FROM evento_integrantes_externos eie
      INNER JOIN Eventos e 
        ON eie.evento_id = e.EventoID
      WHERE eie.integrante_externo_id = @integranteId
    `;

    if (conAsistencia === 'true') {
      query += ' AND eie.asistencia = 1';
    } else if (conAsistencia === 'false') {
      query += ' AND eie.asistencia = 0';
    }

    query += ' ORDER BY e.F_Inicio DESC';

    // 2) Ejecutar la consulta en SQL Server
    const result = await pool.request()
      .input('integranteId', integranteId)
      .query(query);

    const sqlRecordset = result.recordset;

    // 3) Extraer los sqlEventoIds para filtrar en Mongo
    const sqlEventoIds = sqlRecordset.map(r => r.EventoID);
    if (sqlEventoIds.length === 0) {
      // Si no hay participaciones, devolvemos un array vacío
      return res.json({
        success: true,
        integranteId: parseInt(integranteId),
        eventos: [],
        total: 0,
        filtros: { estado, conAsistencia }
      });
    }

    // 4) Consultar Mongo (colección de eventos) sólo con los sqlEventoIds recuperados
    const filtrosMongo = { 
      sqlEventoId: { $in: sqlEventoIds },
      activo: true 
    };
    if (estado) {
      filtrosMongo.estado = estado;
    }

    const eventosCompletos = await Evento.find(filtrosMongo)
      .limit(parseInt(limite))
      .lean();

    // 5) Combinar datos de Mongo con la asistencia traída de SQL
    const eventosCombinados = eventosCompletos.map(eventoMongo => {
      const filaSQL = sqlRecordset.find(r => r.EventoID === eventoMongo.sqlEventoId);

      // Armar imagen principal si existen imágenesPromocionales en Mongo
      if (eventoMongo.imagenesPromocionales?.length > 0) {
        eventoMongo.imagenPrincipal = {
          url: `data:${eventoMongo.imagenesPromocionales[0].mimeType};base64,${eventoMongo.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete eventoMongo.imagenesPromocionales;

      return {
        ...eventoMongo,
        participacion: {
          asistencia: filaSQL.asistencia
        }
      };
    });

    return res.json({
      success: true,
      integranteId: parseInt(integranteId),
      eventos: eventosCombinados,
      total: eventosCombinados.length,
      filtros: { estado, conAsistencia }
    });

  } catch (error) {
    console.error('Error obteniendo eventos del integrante:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener eventos del integrante'
    });
  }
};

// Obtener transiciones disponibles
const getAvailableTransitions = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.query;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver transiciones de este evento'
      });
    }

    const estadoActual = evento.estado;
    const transicionesPermitidas = TRANSICIONES_VALIDAS[estadoActual] || [];
    
    const transicionesValidas = [];
    for (const estado of transicionesPermitidas) {
      const validacion = await validarCambioEstado(evento, estado);
      transicionesValidas.push({
        estado,
        valido: validacion.valido,
        razon: validacion.error || 'Transición válida'
      });
    }

    res.json({
      success: true,
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        estadoActual
      },
      transiciones: transicionesValidas,
      historial: evento.historialEstados || []
    });

  } catch (error) {
    console.error('Error obteniendo transiciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener transiciones disponibles'
    });
  }
};

// Historial de estados del evento
const getEventStatusHistory = async (req, res) => {
  try {
    const { eventoId } = req.params;
    const { ongId } = req.query;

    const evento = await Evento.findById(eventoId);
    if (!evento || !evento.activo) {
      return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
      });
    }

    if (evento.ongId !== parseInt(ongId)) {
      return res.status(403).json({
        success: false,
        error: 'No autorizado para ver historial de este evento'
      });
    }

    const historial = evento.historialEstados || [];
    
    const pool = await poolPromise;
    const historialEnriquecido = await Promise.all(historial.map(async (cambio) => {
      if (cambio.usuarioId) {
        try {
          const usuario = await pool.request()
            .input('usuarioId', cambio.usuarioId)
            .query('SELECT nombre_usuario FROM usuarios WHERE id_usuario = @usuarioId');
          
          return {
            ...cambio.toObject ? cambio.toObject() : cambio,
            nombreUsuario: usuario.recordset[0]?.nombre_usuario || 'Usuario desconocido'
          };
        } catch (error) {
          return {
            ...cambio.toObject ? cambio.toObject() : cambio,
            nombreUsuario: 'Usuario desconocido'
          };
        }
      }
      return cambio.toObject ? cambio.toObject() : cambio;
    }));

    res.json({
      success: true,
      evento: {
        id: evento._id,
        titulo: evento.titulo,
        estadoActual: evento.estado
      },
      historial: historialEnriquecido.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    });

  } catch (error) {
    console.error('Error obteniendo historial de estados:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener historial de estados'
    });
  }
};

// Dashboard de estados para ONG
const getOngStatusDashboard = async (req, res) => {
  try {
    const { ongId } = req.params;

    const esONG = await validarONG(ongId);
    if (!esONG) {
      return res.status(403).json({
        success: false,
        error: 'Solo las ONGs pueden acceder a este dashboard'
      });
    }

    const filtros = { 
      ongId: parseInt(ongId),
      activo: true 
    };

    // Estadísticas por estado
    const estadisticasPorEstado = await Evento.aggregate([
      { $match: filtros },
      {
        $group: {
          _id: '$estado',
          count: { $sum: 1 },
          ultimoEvento: { $max: '$fechaInicio' },
          totalParticipantes: { $sum: '$metricas.totalInscritos' }
        }
      }
    ]);

    // Eventos próximos a cambiar de estado
    const ahora = new Date();
    const proximosACambiar = await Evento.find({
      ...filtros,
      $or: [
        { estado: 'publicado', fechaInicio: { $lte: new Date(ahora.getTime() + 24 * 60 * 60 * 1000) } },
        { estado: 'en_curso', fechaFinal: { $lte: new Date(ahora.getTime() + 24 * 60 * 60 * 1000) } }
      ]
    }).select('titulo fechaInicio fechaFinal estado').lean();

    // Eventos que necesitan atención
    const necesitanAtencion = await Evento.find({
      ...filtros,
      $or: [
        { estado: 'borrador', fechaInicio: { $lte: new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000) } },
        { estado: 'suspendido' },
        { estado: 'en_curso', fechaFinal: { $lt: ahora } }
      ]
    }).select('titulo fechaInicio estado').lean();

    // Formatear estadísticas
    const estadisticasFormateadas = {};
    Object.values(ESTADOS_EVENTO).forEach(estado => {
      estadisticasFormateadas[estado] = {
        count: 0,
        ultimoEvento: null,
        totalParticipantes: 0
      };
    });

    estadisticasPorEstado.forEach(stat => {
      estadisticasFormateadas[stat._id] = {
        count: stat.count,
        ultimoEvento: stat.ultimoEvento,
        totalParticipantes: stat.totalParticipantes
      };
    });

    res.json({
      success: true,
      ongId: parseInt(ongId),
      resumen: {
        totalEventos: Object.values(estadisticasFormateadas).reduce((sum, stat) => sum + stat.count, 0),
        eventosActivos: estadisticasFormateadas[ESTADOS_EVENTO.PUBLICADO].count + estadisticasFormateadas[ESTADOS_EVENTO.EN_CURSO].count,
        eventosSuspendidos: estadisticasFormateadas[ESTADOS_EVENTO.SUSPENDIDO].count,
        eventosFinalizados: estadisticasFormateadas[ESTADOS_EVENTO.FINALIZADO].count
      },
      estadisticasPorEstado: estadisticasFormateadas,
      alertas: {
        proximosACambiar,
        necesitanAtencion
      },
      fecha: new Date()
    });

  } catch (error) {
    console.error('Error obteniendo dashboard de estados:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener dashboard de estados'
    });
  }
};

// Registrar patrocinador
const registrarPatrocinador = async (req, res) => {
  const eventoId = parseInt(req.params.id, 10);
  const empresaId = parseInt(req.body.empresa_id, 10);

  if (!eventoId || !empresaId) {
    return res.status(400).json({ success: false, error: 'Faltan datos: eventoId o empresaId' });
  }

  try {
    const pool = await poolPromise;

    // Verificar que el evento existe
    const eventoCheck = await pool.request()
      .input('eventoId', sql.Int, eventoId)
      .query(`
        SELECT 1 
        FROM Eventos 
        WHERE EventoID = @eventoId;
      `);
    if (eventoCheck.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'El evento no existe' });
    }

    // Verificar que la empresa existe
    const empresaCheck = await pool.request()
      .input('empresaId', sql.Int, empresaId)
      .query(`
        SELECT 1 
        FROM empresas 
        WHERE id_usuario = @empresaId;
      `);
    if (empresaCheck.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'La empresa no existe' });
    }

    // Verificar si ya está registrada como patrocinador
    const check = await pool.request()
      .input('eventoId', sql.Int, eventoId)
      .input('empresaId', sql.Int, empresaId)
      .query(`
        SELECT 1 
        FROM evento_patrocinadores 
        WHERE evento_id = @eventoId 
          AND empresa_id = @empresaId;
      `);

    if (check.recordset.length > 0) {
      return res.status(409).json({ success: false, error: 'Ya está registrada como patrocinador' });
    }

    // Insertar en evento_patrocinadores
    await pool.request()
      .input('eventoId', sql.Int, eventoId)
      .input('empresaId', sql.Int, empresaId)
      .query(`
        INSERT INTO evento_patrocinadores (evento_id, empresa_id) 
        VALUES (@eventoId, @empresaId);
      `);

    return res.json({ success: true, message: 'Empresa registrada como patrocinador' });

  } catch (err) {
    console.error('Error en registrarPatrocinador:', err);
    return res.status(500).json({ success: false, error: 'Error interno de servidor' });
  }
};

// Registrar auspiciador
const registrarAuspiciador = async (req, res) => {
  const eventoId = parseInt(req.params.id, 10);
  const empresaId = parseInt(req.body.empresa_id, 10);

  if (!eventoId || !empresaId) {
    return res.status(400).json({ success: false, error: 'Faltan datos: eventoId o empresaId' });
  }

  try {
    const pool = await poolPromise;

    // Verificar que el evento existe
    const eventoCheck = await pool.request()
      .input('eventoId', sql.Int, eventoId)
      .query(`
        SELECT 1 
        FROM Eventos 
        WHERE EventoID = @eventoId;
      `);
    if (eventoCheck.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'El evento no existe' });
    }

    // Verificar que la empresa existe
    const empresaCheck = await pool.request()
      .input('empresaId', sql.Int, empresaId)
      .query(`
        SELECT 1 
        FROM empresas 
        WHERE id_usuario = @empresaId;
      `);
    if (empresaCheck.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'La empresa no existe' });
    }

    // Verificar si ya está registrada como auspiciador
    const check = await pool.request()
      .input('eventoId', sql.Int, eventoId)
      .input('empresaId', sql.Int, empresaId)
      .query(`
        SELECT 1 
        FROM evento_Auspisiadores 
        WHERE evento_id = @eventoId 
          AND empresa_id = @empresaId;
      `);

    if (check.recordset.length > 0) {
      return res.status(409).json({ success: false, error: 'Ya está registrada como auspiciador' });
    }

    // Insertar en evento_Auspisiadores
    await pool.request()
      .input('eventoId', sql.Int, eventoId)
      .input('empresaId', sql.Int, empresaId)
      .query(`
        INSERT INTO evento_Auspisiadores (evento_id, empresa_id) 
        VALUES (@eventoId, @empresaId);
      `);

    return res.json({ success: true, message: 'Empresa registrada como auspiciador' });

  } catch (err) {
    console.error('Error en registrarAuspiciador:', err);
    return res.status(500).json({ success: false, error: 'Error interno de servidor' });
  }
};

// Obtener eventos donde el usuario actual está registrado
const getMyParticipationEvents = async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { estado, conAsistencia, limite = 10 } = req.query;

    // 1) Buscar el integrante_externo_id basado en el usuarioId
    const pool = await poolPromise;
    const integranteResult = await pool.request()
      .input('usuarioId', usuarioId)
      .query(`
        SELECT id_usuario as integranteId
        FROM integrantes_externos 
        WHERE id_usuario = @usuarioId
      `);

    if (integranteResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado como integrante externo'
      });
    }

    const integranteId = integranteResult.recordset[0].integranteId;

    // 2) Buscar eventos donde está registrado
    let query = `
      SELECT 
        e.EventoID, 
        e.Tittulo, 
        e.F_Inicio, 
        e.F_final,
        e.Locacion, 
        eie.asistencia,
        eie.tipo_participante
      FROM evento_integrantes_externos eie
      INNER JOIN Eventos e 
        ON eie.evento_id = e.EventoID
      WHERE eie.integrante_externo_id = @integranteId
    `;

    if (conAsistencia === 'true') {
      query += ' AND eie.asistencia = 1';
    } else if (conAsistencia === 'false') {
      query += ' AND eie.asistencia = 0';
    }

    query += ' ORDER BY e.F_Inicio DESC';

    const result = await pool.request()
      .input('integranteId', integranteId)
      .query(query);

    const sqlRecordset = result.recordset;

    if (sqlRecordset.length === 0) {
      return res.json({
        success: true,
        usuarioId: parseInt(usuarioId),
        eventos: [],
        total: 0,
        mensaje: 'No estás registrado en ningún evento'
      });
    }

    // 3) Obtener detalles completos de MongoDB
    const sqlEventoIds = sqlRecordset.map(r => r.EventoID);
    const filtrosMongo = { 
      sqlEventoId: { $in: sqlEventoIds },
      activo: true 
    };
    
    if (estado) {
      filtrosMongo.estado = estado;
    }

    const eventosCompletos = await Evento.find(filtrosMongo)
      .limit(parseInt(limite))
      .lean();

    // 4) Combinar datos
    const eventosCombinados = eventosCompletos.map(eventoMongo => {
      const filaSQL = sqlRecordset.find(r => r.EventoID === eventoMongo.sqlEventoId);

      // Imagen principal
      if (eventoMongo.imagenesPromocionales?.length > 0) {
        eventoMongo.imagenPrincipal = {
          url: `data:${eventoMongo.imagenesPromocionales[0].mimeType};base64,${eventoMongo.imagenesPromocionales[0].datos.toString('base64')}`
        };
      }
      delete eventoMongo.imagenesPromocionales;

      return {
        ...eventoMongo,
        miParticipacion: {
          tipoParticipante: filaSQL.tipo_participante || 'participante',
          asistencia: filaSQL.asistencia,
          fechaEvento: filaSQL.F_Inicio,
          fechaFinal: filaSQL.F_final
        }
      };
    });

    // 5) Separar por categorías
    const eventosActivos = eventosCombinados.filter(e => 
      ['publicado', 'en_curso'].includes(e.estado) && 
      new Date(e.fechaInicio) >= new Date()
    );
    
    const eventosFinalizados = eventosCombinados.filter(e => 
      e.estado === 'finalizado' || 
      new Date(e.fechaFinal || e.fechaInicio) < new Date()
    );

    return res.json({
      success: true,
      usuarioId: parseInt(usuarioId),
      resumen: {
        totalEventos: eventosCombinados.length,
        eventosActivos: eventosActivos.length,
        eventosFinalizados: eventosFinalizados.length,
        comoCertificado: eventosCombinados.filter(e => e.miParticipacion.asistencia === 1).length
      },
      eventos: {
        activos: eventosActivos,
        finalizados: eventosFinalizados,
        todos: eventosCombinados
      },
      filtros: { estado, conAsistencia }
    });

  } catch (error) {
    console.error('Error obteniendo mis eventos:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener tus eventos'
    });
  }
};

// ================ EXPORTS ================

module.exports = {
  //escaner de check-in
  scanCheckIn,

  // CRUD básico
  createEvent,
  getAllEvents,
  getEventById,
  getOngEvents,
  updateEvent,
  deleteEvent,
  
  // Participantes
  registerParticipant,
  registerAttendance,
  getEventParticipants,
  
  // Imágenes
  deleteEventImage,
  
  // Estadísticas
  getEventStatistics,
  getSystemStatistics,
  
  // Empresas
  getAvailableCompanies,
  
  // Búsqueda y filtros
  searchEvents,
  getUpcomingEvents,
  getEventsByType,
  
  // Gestión de estados
  changeEventStatus,
  getEventsByStatus,
  getStatusStatistics,
  getAvailableTransitions,
  getEventStatusHistory,
  getOngStatusDashboard,
  
  // Consultas específicas
  getCompanyEvents,
  getUserParticipationEvents,

  registrarPatrocinador,
  registrarAuspiciador,
  getMyParticipationEvents,

  // Configuración
  upload,
  ESTADOS_EVENTO,
  TRANSICIONES_VALIDAS
};