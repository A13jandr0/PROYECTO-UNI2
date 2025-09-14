const { poolPromise } = require('../config/db');
const Evento      = require('../models/evento.model');
const InvitadoMongo    = require('../models/invitado.model'); // modelo Mongo
const sql           = require('mssql');

const crearInvitadoEspecial = async (req, res) => {
    try {
        const { nombres, apellidos, cedula_identidad, email, telefono, tipo_invitado } = req.body;

        if (!nombres || !apellidos || !cedula_identidad || !tipo_invitado) {
            return res.status(400).json({
                success: false,
                error: 'Los campos nombres, apellidos, cédula y tipo de invitado son obligatorios'
            });
        }

        const pool = await poolPromise;

        const existe = await pool.request()
            .input('cedula', cedula_identidad)
            .query('SELECT id_invitado FROM invitados_especiales WHERE cedula_identidad = @cedula');

        if (existe.recordset.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Ya existe un invitado con esta cédula de identidad'
            });
        }

        const result = await pool.request()
            .input('nombres', nombres.trim())
            .input('apellidos', apellidos.trim())
            .input('cedula_identidad', cedula_identidad.trim())
            .input('email', email?.trim() || null)
            .input('telefono', telefono?.trim() || null)
            .input('tipo_invitado', tipo_invitado)
            .query(`
                INSERT INTO invitados_especiales (nombres, apellidos, cedula_identidad, email, telefono, tipo_invitado)
                OUTPUT INSERTED.id_invitado, INSERTED.nombres, INSERTED.apellidos
                VALUES (@nombres, @apellidos, @cedula_identidad, @email, @telefono, @tipo_invitado)
            `);

        const invitado = result.recordset[0];

        res.status(201).json({
            success: true,
            message: 'Invitado especial creado exitosamente',
            invitado: {
                id: invitado.id_invitado,
                nombre: `${invitado.nombres} ${invitado.apellidos}`,
                cedula: cedula_identidad
            }
        });

    } catch (error) {
        console.error('Error creando invitado:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
};

const obtenerInvitados = async (req, res) => {
    try {
        const { tipo_invitado, busqueda, limite = 50, pagina = 1 } = req.query;
        const pool = await poolPromise;
        const offset = (parseInt(pagina) - 1) * parseInt(limite);

        let whereClause = 'WHERE ie.activo = 1';
        const request = pool.request();

        if (tipo_invitado) {
            whereClause += ' AND ie.tipo_invitado = @tipo_invitado';
            request.input('tipo_invitado', tipo_invitado);
        }

        if (busqueda) {
            whereClause += ' AND (ie.nombres LIKE @busqueda OR ie.apellidos LIKE @busqueda OR ie.cedula_identidad LIKE @busqueda)';
            request.input('busqueda', `%${busqueda}%`);
        }

        const query = `
            SELECT 
                ie.id_invitado,
                ie.nombres + ' ' + ie.apellidos AS nombre_completo,
                ie.cedula_identidad,
                ie.email,
                ie.telefono,
                ie.tipo_invitado,
                ie.fecha_registro,
                ISNULL(stats.total_eventos, 0) AS total_eventos,
                ISNULL(stats.total_mega_eventos, 0) AS total_mega_eventos,
                ISNULL(stats.total_asistencias, 0) AS total_asistencias
            FROM invitados_especiales ie
            LEFT JOIN vw_estadisticas_invitados stats ON ie.id_invitado = stats.id_invitado
            ${whereClause}
            ORDER BY ie.fecha_registro DESC
            OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
        `;

        request.input('offset', offset).input('limite', parseInt(limite));
        const result = await request.query(query);

        const countResult = await pool.request()
            .input('tipo_invitado', tipo_invitado || null)
            .input('busqueda', busqueda ? `%${busqueda}%` : null)
            .query(`
                SELECT COUNT(*) AS total
                FROM invitados_especiales ie
                ${whereClause}
            `);

        const total = countResult.recordset[0].total;

        res.json({
            success: true,
            invitados: result.recordset,
            paginacion: {
                pagina: parseInt(pagina),
                limite: parseInt(limite),
                total,
                totalPaginas: Math.ceil(total / parseInt(limite))
            }
        });

    } catch (error) {
        console.error('Error obteniendo invitados:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener invitados'
        });
    }
};

const obtenerInvitadoPorId = async (req, res) => {
    try {
        const { identificador } = req.params;
        const pool = await poolPromise;

        let whereClause, inputName;
        if (isNaN(identificador)) {
            whereClause = 'WHERE ie.cedula_identidad = @identificador';
            inputName = 'identificador';
        } else {
            whereClause = 'WHERE ie.id_invitado = @identificador';
            inputName = 'identificador';
        }

        const result = await pool.request()
            .input(inputName, identificador)
            .query(`
                SELECT 
                    ie.*,
                    ISNULL(stats.total_eventos, 0) AS total_eventos,
                    ISNULL(stats.total_mega_eventos, 0) AS total_mega_eventos,
                    ISNULL(stats.total_asistencias, 0) AS total_asistencias
                FROM invitados_especiales ie
                LEFT JOIN vw_estadisticas_invitados stats ON ie.id_invitado = stats.id_invitado
                ${whereClause} AND ie.activo = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Invitado especial no encontrado'
            });
        }

        const invitado = result.recordset[0];

        res.json({
            success: true,
            invitado
        });

    } catch (error) {
        console.error('Error obteniendo invitado especial:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener invitado especial'
        });
    }
};

const obtenerHistorialInvitado = async (req, res) => {
    try {
        const { cedula } = req.params;
        const pool = await poolPromise;

        const invitadoResult = await pool.request()
            .input('cedula', cedula)
            .query(`
                SELECT ie.*, 
                       ISNULL(stats.total_eventos, 0) AS total_eventos,
                       ISNULL(stats.total_mega_eventos, 0) AS total_mega_eventos,
                       ISNULL(stats.total_asistencias, 0) AS total_asistencias
                FROM invitados_especiales ie
                LEFT JOIN vw_estadisticas_invitados stats ON ie.id_invitado = stats.id_invitado
                WHERE ie.cedula_identidad = @cedula AND ie.activo = 1
            `);

        if (invitadoResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Invitado no encontrado'
            });
        }

        const invitado = invitadoResult.recordset[0];

        const historialResult = await pool.request()
            .input('invitadoId', invitado.id_invitado)
            .query(`
                SELECT 
                    'Evento' AS tipo,
                    e.Tittulo AS titulo,
                    e.F_Inicio AS fecha_inicio,
                    eie.rol_evento AS rol,
                    eie.estado_invitacion,
                    eie.asistencia,
                    eie.fecha_invitacion
                FROM evento_invitados_especiales eie
                INNER JOIN Eventos e ON eie.evento_id = e.EventoID
                WHERE eie.invitado_id = @invitadoId
                
                UNION ALL
                
                SELECT 
                    'Mega Evento' AS tipo,
                    me.titulo,
                    me.fecha_inicio,
                    meie.rol_mega_evento AS rol,
                    meie.estado_invitacion,
                    meie.asistencia,
                    meie.fecha_invitacion
                FROM mega_evento_invitados_especiales meie
                INNER JOIN mega_eventos me ON meie.mega_evento_id = me.MegaEventoID
                WHERE meie.invitado_id = @invitadoId
                
                ORDER BY fecha_inicio DESC
            `);

        res.json({
            success: true,
            invitado,
            historial: historialResult.recordset
        });

    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener historial'
        });
    }
};
const VALORES_VALIDOS = [
  'enviada',
  'confirmada',
  'cancelada',
  'rechazada'
];

const cambiarEstadoInvitacion = async (req, res) => {
  try {
    const { eventoId, invitadoId } = req.params;
    const { estado } = req.body;

    // Validación
    if (!VALORES_VALIDOS.includes(estado)) {
      return res.status(400).json({
        success: false,
        error: `Estado inválido. Debe ser uno de: ${VALORES_VALIDOS.join(', ')}`
      });
    }

    // Obtener el sqlEventoId…
    const ev = await Evento.findById(eventoId).select('sqlEventoId');
    if (!ev) return res.status(404).json({ success:false, error:'Evento no encontrado' });
    const sqlEventoId = ev.sqlEventoId;

    // Actualizar en SQL Server
    const pool = await poolPromise;
    await pool.request()
      .input('eventoId',   sql.Int, sqlEventoId)
      .input('invitadoId', sql.Int, Number(invitadoId))
      .input('estado',     sql.VarChar(20), estado)
      .query(`
        UPDATE evento_invitados_especiales
        SET estado_invitacion = @estado
        WHERE evento_id = @eventoId
          AND invitado_id = @invitadoId
      `);

    return res.json({
      success: true,
      message: `Estado actualizado a "${estado}"`,
      invitadoId,
      estado
    });
  } catch (err) {
    console.error('Error actualizando estado invitación:', err);
    return res.status(500).json({
      success: false,
      error: 'Error interno al actualizar estado'
    });
  }
};

const actualizarInvitadoEspecial = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombres, apellidos, email, telefono, tipo_invitado } = req.body;

        const pool = await poolPromise;

        const existeInvitado = await pool.request()
            .input('id', id)
            .query('SELECT id_invitado FROM invitados_especiales WHERE id_invitado = @id AND activo = 1');

        if (existeInvitado.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Invitado especial no encontrado'
            });
        }

        await pool.request()
            .input('id', id)
            .input('nombres', nombres?.trim())
            .input('apellidos', apellidos?.trim())
            .input('email', email?.trim() || null)
            .input('telefono', telefono?.trim() || null)
            .input('tipo_invitado', tipo_invitado)
            .query(`
                UPDATE invitados_especiales 
                SET 
                    nombres = ISNULL(@nombres, nombres),
                    apellidos = ISNULL(@apellidos, apellidos),
                    email = @email,
                    telefono = @telefono,
                    tipo_invitado = ISNULL(@tipo_invitado, tipo_invitado)
                WHERE id_invitado = @id
            `);

        res.json({
            success: true,
            message: 'Invitado especial actualizado exitosamente'
        });

    } catch (error) {
        console.error('Error actualizando invitado especial:', error);
        res.status(500).json({
            success: false,
            error: 'Error al actualizar invitado especial'
        });
    }
};

const buscarOCrearInvitado = async (req, res) => {
    try {
        const { cedula_identidad, nombres, apellidos, email, telefono, tipo_invitado } = req.body;

        if (!cedula_identidad) {
            return res.status(400).json({
                success: false,
                error: 'La cédula de identidad es obligatoria'
            });
        }

        const pool = await poolPromise;

        const existeResult = await pool.request()
            .input('cedula', cedula_identidad.trim())
            .query(`
                SELECT 
                    id_invitado,
                    nombres + ' ' + apellidos AS nombre_completo,
                    cedula_identidad,
                    email,
                    telefono,
                    tipo_invitado
                FROM invitados_especiales 
                WHERE cedula_identidad = @cedula AND activo = 1
            `);

        if (existeResult.recordset.length > 0) {
            return res.json({
                success: true,
                mensaje: 'Invitado encontrado',
                invitado: existeResult.recordset[0],
                creado: false
            });
        }

        if (!nombres || !apellidos || !tipo_invitado) {
            return res.status(400).json({
                success: false,
                error: 'Para crear un nuevo invitado se requieren: nombres, apellidos y tipo de invitado'
            });
        }

        const createResult = await pool.request()
            .input('nombres', nombres.trim())
            .input('apellidos', apellidos.trim())
            .input('cedula_identidad', cedula_identidad.trim())
            .input('email', email?.trim() || null)
            .input('telefono', telefono?.trim() || null)
            .input('tipo_invitado', tipo_invitado)
            .query(`
                INSERT INTO invitados_especiales (nombres, apellidos, cedula_identidad, email, telefono, tipo_invitado)
                OUTPUT 
                    INSERTED.id_invitado,
                    INSERTED.nombres + ' ' + INSERTED.apellidos AS nombre_completo,
                    INSERTED.cedula_identidad,
                    INSERTED.email,
                    INSERTED.telefono,
                    INSERTED.tipo_invitado
                VALUES (@nombres, @apellidos, @cedula_identidad, @email, @telefono, @tipo_invitado)
            `);

        res.status(201).json({
            success: true,
            mensaje: 'Nuevo invitado creado',
            invitado: createResult.recordset[0],
            creado: true
        });

    } catch (error) {
        console.error('Error buscando/creando invitado:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
};

// controllers/list.controller.js
const agregarInvitadosAEvento = async (req, res) => {
  try {
    const { eventoId } = req.params;

    // 1) Parsear el campo 'invitados' que viene como string JSON
    let invitados;
    if (typeof req.body.invitados === 'string') {
      try {
        invitados = JSON.parse(req.body.invitados);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Formato inválido para invitados'
        });
      }
    } else if (Array.isArray(req.body.invitados)) {
      invitados = req.body.invitados;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Se debe proporcionar un array de invitados'
      });
    }

    if (!Array.isArray(invitados) || invitados.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se debe proporcionar un array de invitados'
      });
    }

    // 2) Obtener sqlEventoId desde Mongo
    const ev = await Evento.findById(eventoId).select('sqlEventoId');
    if (!ev) {
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    }
    const sqlEventoId = ev.sqlEventoId;

    // 3) Iniciar transacción
    const pool = await poolPromise;
    const tx   = pool.transaction();
    await tx.begin();

    const resultados = [];
    const fotoBuffer = req.file?.buffer;

    try {
      for (const inv of invitados) {
        let invitadoId;
        const {
          cedula_identidad, nombres, apellidos,
          email, telefono, tipo_invitado,
          rol_evento, observaciones
        } = inv;

        if (!cedula_identidad?.trim() || !rol_evento?.trim()) {
          resultados.push({
            cedula: cedula_identidad || '—',
            error: 'Faltan datos esenciales (cédula y rol_evento)'
          });
          continue;
        }

        const r = tx.request();

        // 3) ¿Existe ya el invitado?
        const existe = await r
          .input('cedula', cedula_identidad.trim())
          .query(`
            SELECT id_invitado, nombres, apellidos
            FROM invitados_especiales
            WHERE cedula_identidad = @cedula AND activo = 1
          `);

        if (existe.recordset.length) {
          // 3a) Reutilizar ID
          const row = existe.recordset[0];
          invitadoId = row.id_invitado;
          resultados.push({
            cedula: cedula_identidad,
            nombre: `${row.nombres} ${row.apellidos}`,
            accion: 'Invitado existente reutilizado'
          });

          // 3b) Si llega foto nueva, actualizar
          if (fotoBuffer) {
            await tx.request()
              .input('id', invitadoId)
              .input('foto', sql.VarBinary(sql.MAX), fotoBuffer)
              .query(`
                UPDATE invitados_especiales
                SET foto = @foto
                WHERE id_invitado = @id
              `);
          }

        } else {
          // 4) Crear nuevo invitado (incluyendo foto si existe)
          const ins = tx.request()
            .input('nombres',          nombres.trim())
            .input('apellidos',        apellidos.trim())
            .input('cedula_identidad', cedula_identidad.trim())
            .input('email',            email?.trim()    || null)
            .input('telefono',         telefono?.trim() || null)
            .input('tipo_invitado',    tipo_invitado);

          if (fotoBuffer) {
            ins.input('foto', sql.VarBinary(sql.MAX), fotoBuffer);
          } else {
            ins.input('foto', sql.VarBinary(sql.MAX), null);
          }

          const nuevo = await ins.query(`
            INSERT INTO invitados_especiales
              (nombres, apellidos, cedula_identidad, email, telefono, tipo_invitado${ fotoBuffer ? ', foto' : '' })
            OUTPUT INSERTED.id_invitado
            VALUES
              (@nombres, @apellidos, @cedula_identidad, @email, @telefono, @tipo_invitado${ fotoBuffer ? ', @foto' : ''})
          `);

          invitadoId = nuevo.recordset[0].id_invitado;
          resultados.push({
            cedula: cedula_identidad,
            nombre: `${nombres} ${apellidos}`,
            accion: 'Nuevo invitado creado'
          });
        }

        // 5) Vincularlo al evento
        const linkCheck = await tx.request()
          .input('eventoId',   sqlEventoId)
          .input('invitadoId', invitadoId)
          .query(`
            SELECT 1
            FROM evento_invitados_especiales
            WHERE evento_id = @eventoId
              AND invitado_id = @invitadoId
          `);

        if (!linkCheck.recordset.length) {
          await tx.request()
            .input('eventoId',     sqlEventoId)
            .input('invitadoId',   invitadoId)
            .input('rolEvento',    rol_evento.trim())
            .input('observaciones',observaciones || null)
            .query(`
              INSERT INTO evento_invitados_especiales
                (evento_id, invitado_id, rol_evento, observaciones)
              VALUES
                (@eventoId, @invitadoId, @rolEvento, @observaciones)
            `);

          Object.assign(
            resultados.find(r => r.cedula === cedula_identidad),
            { rol: rol_evento, agregado_evento: true }
          );
        } else {
          Object.assign(
            resultados.find(r => r.cedula === cedula_identidad),
            { nota: 'Ya estaba invitado al evento' }
          );
        }
      }

      // 6) Commit y respuesta
      await tx.commit();
      return res.json({
        success : true,
        message : `Lista de invitados procesada para el evento ${sqlEventoId}`,
        resultados,
        resumen: {
          total_procesados: invitados.length,
          exitosos        : resultados.filter(r => !r.error).length,
          errores         : resultados.filter(r => r.error).length
        }
      });

    } catch (txErr) {
      await tx.rollback().catch(()=>{/*no-op*/});
      console.error('❌ Error en transacción:', txErr);
      return res.status(500).json({ success:false, error: txErr.message });
    }

  } catch (err) {
    console.error('Error agregando invitados a evento:', err);
    res.status(500).json({ success:false, error:'Error al procesar lista de invitados' });
  }
};

const agregarInvitadosAMegaEvento = async (req, res) => {
    try {
        const { megaEventoId } = req.params;
        const { invitados } = req.body;

        if (!Array.isArray(invitados) || invitados.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Se debe proporcionar un array de invitados'
            });
        }

        const pool = await poolPromise;
        const transaction = pool.transaction();
        
        try {
            await transaction.begin();

            const resultados = [];

            for (const invitadoData of invitados) {
                const { 
                    cedula_identidad, 
                    nombres, 
                    apellidos, 
                    email, 
                    telefono, 
                    tipo_invitado, 
                    rol_mega_evento,
                    observaciones 
                } = invitadoData;

                if (!cedula_identidad || !rol_mega_evento) {
                    resultados.push({
                        cedula: cedula_identidad || 'Sin cédula',
                        error: 'Faltan datos esenciales (cédula y rol)'
                    });
                    continue;
                }

                let invitadoId;
                const existeResult = await transaction.request()
                    .input('cedula', cedula_identidad.trim())
                    .query('SELECT id_invitado, nombres, apellidos FROM invitados_especiales WHERE cedula_identidad = @cedula AND activo = 1');

                if (existeResult.recordset.length > 0) {
                    const existente = existeResult.recordset[0];
                    invitadoId = existente.id_invitado;
                    
                    resultados.push({
                        cedula: cedula_identidad,
                        nombre: `${existente.nombres} ${existente.apellidos}`,
                        accion: 'Invitado existente reutilizado'
                    });
                } else {
                    if (!nombres || !apellidos || !tipo_invitado) {
                        resultados.push({
                            cedula: cedula_identidad,
                            error: 'Faltan datos para crear invitado (nombres, apellidos, tipo)'
                        });
                        continue;
                    }

                    const createResult = await transaction.request()
                        .input('nombres', nombres.trim())
                        .input('apellidos', apellidos.trim())
                        .input('cedula_identidad', cedula_identidad.trim())
                        .input('email', email?.trim() || null)
                        .input('telefono', telefono?.trim() || null)
                        .input('tipo_invitado', tipo_invitado)
                        .query(`
                            INSERT INTO invitados_especiales (nombres, apellidos, cedula_identidad, email, telefono, tipo_invitado)
                            OUTPUT INSERTED.id_invitado
                            VALUES (@nombres, @apellidos, @cedula_identidad, @email, @telefono, @tipo_invitado)
                        `);

                    invitadoId = createResult.recordset[0].id_invitado;
                    
                    resultados.push({
                        cedula: cedula_identidad,
                        nombre: `${nombres} ${apellidos}`,
                        accion: 'Nuevo invitado creado'
                    });
                }

                const yaInvitadoResult = await transaction.request()
                    .input('megaEventoId', megaEventoId)
                    .input('invitadoId', invitadoId)
                    .query('SELECT 1 FROM mega_evento_invitados_especiales WHERE mega_evento_id = @megaEventoId AND invitado_id = @invitadoId');

                if (yaInvitadoResult.recordset.length === 0) {
                    await transaction.request()
                        .input('megaEventoId', megaEventoId)
                        .input('invitadoId', invitadoId)
                        .input('rolMegaEvento', rol_mega_evento)
                        .input('observaciones', observaciones || null)
                        .query(`
                            INSERT INTO mega_evento_invitados_especiales (mega_evento_id, invitado_id, rol_mega_evento, observaciones)
                            VALUES (@megaEventoId, @invitadoId, @rolMegaEvento, @observaciones)
                        `);

                    const index = resultados.findIndex(r => r.cedula === cedula_identidad);
                    if (index !== -1) {
                        resultados[index].rol = rol_mega_evento;
                        resultados[index].agregado_mega_evento = true;
                    }
                } else {
                    const index = resultados.findIndex(r => r.cedula === cedula_identidad);
                    if (index !== -1) {
                        resultados[index].nota = 'Ya estaba invitado al mega evento';
                    }
                }
            }

            await transaction.commit();

            res.json({
                success: true,
                message: `Lista de invitados procesada exitosamente para el mega evento ${megaEventoId}`,
                resultados,
                resumen: {
                    total_procesados: invitados.length,
                    exitosos: resultados.filter(r => !r.error).length,
                    errores: resultados.filter(r => r.error).length
                }
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error agregando invitados a mega evento:', error);
        res.status(500).json({
            success: false,
            error: 'Error al procesar lista de invitados'
        });
    }
};

const registrarAsistencia = async (req, res) => {
    try {
        const { tipo, id, cedula_identidad, asistencia } = req.body;

        if (!tipo || !id || !cedula_identidad || asistencia === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren todos los campos: tipo, id, cedula_identidad, asistencia'
            });
        }

        const pool = await poolPromise;

        const invitadoResult = await pool.request()
            .input('cedula', cedula_identidad)
            .query('SELECT id_invitado FROM invitados_especiales WHERE cedula_identidad = @cedula');

        if (invitadoResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Invitado no encontrado'
            });
        }

        const invitadoId = invitadoResult.recordset[0].id_invitado;

        if (tipo === 'evento') {
            await pool.request()
                .input('eventoId', id)
                .input('invitadoId', invitadoId)
                .input('asistencia', asistencia)
                .query(`
                    UPDATE evento_invitados_especiales 
                    SET asistencia = @asistencia 
                    WHERE evento_id = @eventoId AND invitado_id = @invitadoId
                `);
        } else if (tipo === 'mega_evento') {
            await pool.request()
                .input('megaEventoId', id)
                .input('invitadoId', invitadoId)
                .input('asistencia', asistencia)
                .query(`
                    UPDATE mega_evento_invitados_especiales 
                    SET asistencia = @asistencia 
                    WHERE mega_evento_id = @megaEventoId AND invitado_id = @invitadoId
                `);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Tipo debe ser "evento" o "mega_evento"'
            });
        }

        res.json({
            success: true,
            message: 'Asistencia registrada exitosamente'
        });

    } catch (error) {
        console.error('Error registrando asistencia:', error);
        res.status(500).json({
            success: false,
            error: 'Error al registrar asistencia'
        });
    }
};

// GET /api/list/evento/:eventoId   (router.get('/evento/:eventoId', …))
const obtenerInvitadosEvento = async (req, res) => {
  try {
    // 1) ID Mongo → sqlEventoId
    const { eventoId } = req.params;
    const ev = await Evento.findById(eventoId).select('sqlEventoId');
    if (!ev) {
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    }
    const sqlEventoId = ev.sqlEventoId;  // INT válido

    // 2) Traer invitados + foto desde SQL Server
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('eventoId', sql.Int, sqlEventoId)
      .query(`
        SELECT 
          ie.id_invitado,
          ie.nombres + ' ' + ie.apellidos AS nombre_completo,
          ie.cedula_identidad,
          ie.email,
          ie.telefono,
          ie.tipo_invitado,
          eie.rol_evento,
          eie.estado_invitacion,
          eie.asistencia,
          eie.fecha_invitacion,
          eie.observaciones,
          ie.foto                            -- VARBINARY(MAX)
        FROM   evento_invitados_especiales eie
        JOIN   invitados_especiales        ie 
          ON ie.id_invitado = eie.invitado_id
        WHERE  eie.evento_id = @eventoId
          AND  ie.activo     = 1
        ORDER BY ie.nombres, ie.apellidos;
      `);

    // 3) Mapear y convertir foto a Data-URL
    const invitados = result.recordset.map(inv => {
      let foto_url = null;
      if (inv.foto) {
        // Aunque MIME podría variar, asumiendo image/jpeg. Cámbialo si necesitas PNG u otro.
        const b64     = inv.foto.toString('base64');
        foto_url = `data:image/jpeg;base64,${b64}`;
      }
      return {
        id_invitado:       inv.id_invitado,
        nombre_completo:   inv.nombre_completo,
        cedula_identidad:  inv.cedula_identidad,
        email:             inv.email,
        telefono:          inv.telefono,
        tipo_invitado:     inv.tipo_invitado,
        rol_evento:        inv.rol_evento,
        estado_invitacion: inv.estado_invitacion,
        asistencia:        inv.asistencia,
        fecha_invitacion:  inv.fecha_invitacion,
        observaciones:     inv.observaciones,
        tiene_foto:        !!inv.foto,
        foto_url           // Data-URL o null
      };
    });

    return res.json({ success: true, invitados });

  } catch (err) {
    console.error('Error obteniendo invitados del evento:', err);
    return res.status(500).json({
      success: false,
      error:   'Error al obtener invitados del evento'
    });
  }
};

const actualizarEstadoInvitacion = async (req, res) => {
  try {
    const { eventoId, invitadoId } = req.params;
    const { estado } = req.body;

    // Validación básica
    const estadosPermitidos = ['enviada', 'pendiente', 'confirmado', 'cancelado'];
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido'
      });
    }

    // Obtener sqlEventoId desde Mongo
    const ev = await Evento.findById(eventoId).select('sqlEventoId');
    if (!ev) {
      return res.status(404).json({ success:false, error:'Evento no encontrado' });
    }
    const sqlEventoId = ev.sqlEventoId;

    // Ejecutar actualización
    const pool = await poolPromise;
    const result = await pool.request()
      .input('eventoId',   sql.Int, sqlEventoId)
      .input('invitadoId', sql.Int, invitadoId)
      .input('estado',     sql.VarChar(20), estado)
      .query(`
        UPDATE evento_invitados_especiales
        SET estado_invitacion = @estado
        WHERE evento_id = @eventoId AND invitado_id = @invitadoId
      `);

    return res.json({ success: true, message: 'Estado actualizado correctamente' });

  } catch (err) {
    console.error('Error actualizando estado invitación:', err);
    return res.status(500).json({
      success: false,
      error: 'Error al actualizar estado de la invitación'
    });
  }
};




const obtenerInvitadosMegaEvento = async (req, res) => {
    try {
        const { megaEventoId } = req.params;
        const pool = await poolPromise;

        const result = await pool.request()
            .input('megaEventoId', megaEventoId)
            .query(`
                SELECT 
                    ie.id_invitado,
                    ie.nombres + ' ' + ie.apellidos AS nombre_completo,
                    ie.cedula_identidad,
                    ie.email,
                    ie.telefono,
                    ie.tipo_invitado,
                    meie.rol_mega_evento,
                    meie.estado_invitacion,
                    meie.asistencia,
                    meie.fecha_invitacion,
                    meie.observaciones,
                    ie.foto
                FROM mega_evento_invitados_especiales meie
                INNER JOIN invitados_especiales ie ON meie.invitado_id = ie.id_invitado
                WHERE meie.mega_evento_id = @megaEventoId AND ie.activo = 1
                ORDER BY ie.nombres, ie.apellidos
            `);

        res.json({
            success: true,
            invitados: result.recordset
        });

    } catch (error) {
        console.error('Error obteniendo invitados del mega evento:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener invitados del mega evento'
        });
    }
};

const eliminarInvitadoDeEvento = async (req, res) => {
    try {
        const { eventoId, invitadoId } = req.params;
        const pool = await poolPromise;

        const result = await pool.request()
            .input('eventoId', eventoId)
            .input('invitadoId', invitadoId)
            .query(`
                DELETE FROM evento_invitados_especiales 
                WHERE evento_id = @eventoId AND invitado_id = @invitadoId
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                success: false,
                error: 'Relación invitado-evento no encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Invitado eliminado del evento exitosamente'
        });

    } catch (error) {
        console.error('Error eliminando invitado del evento:', error);
        res.status(500).json({
            success: false,
            error: 'Error al eliminar invitado del evento'
        });
    }
};

const eliminarInvitadoDeMegaEvento = async (req, res) => {
    try {
        const { megaEventoId, invitadoId } = req.params;
        const pool = await poolPromise;

        const result = await pool.request()
            .input('megaEventoId', megaEventoId)
            .input('invitadoId', invitadoId)
            .query(`
                DELETE FROM mega_evento_invitados_especiales 
                WHERE mega_evento_id = @megaEventoId AND invitado_id = @invitadoId
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                success: false,
                error: 'Relación invitado-mega evento no encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Invitado eliminado del mega evento exitosamente'
        });

    } catch (error) {
        console.error('Error eliminando invitado del mega evento:', error);
        res.status(500).json({
            success: false,
            error: 'Error al eliminar invitado del mega evento'
        });
    }
};

module.exports = {
    crearInvitadoEspecial,
    obtenerInvitados,
    obtenerInvitadoPorId,
    obtenerHistorialInvitado,
    actualizarInvitadoEspecial,
    buscarOCrearInvitado,
    agregarInvitadosAEvento,
    agregarInvitadosAMegaEvento,
    registrarAsistencia,
    obtenerInvitadosEvento,
    obtenerInvitadosMegaEvento,
    eliminarInvitadoDeEvento,
    eliminarInvitadoDeMegaEvento,
    actualizarEstadoInvitacion,
    cambiarEstadoInvitacion
};