const Like = require('../models/Like.model');
const Evento = require('../models/evento.model');
const MegaEvento = require('../models/MegaEvento.model');
const User = require('../models/user');
const { poolPromise } = require('../config/db');
const mongoose = require('mongoose');

class LikeController {
  // Dar o quitar like
 
    async toggleLike(req, res) {
    try {
    const { tipoEntidad, entidadId } = req.params;

    // Obtener información del usuario autenticado
    const mongoUser = await User.findById(req.user.userId);
    if (!mongoUser) {
    return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
    });
    }

    const usuarioId = mongoUser.sqlUserId;
    const tipoUsuario = mongoUser.tipo_usuario;

    // Validar tipo de entidad
    if (!['evento', 'mega_evento'].includes(tipoEntidad)) {
    return res.status(400).json({
        success: false,
        error: 'Tipo de entidad no válido. Debe ser "evento" o "mega_evento"'
    });
    }

    // Verificar que la entidad existe
    let entidad;

    if (tipoEntidad === 'evento') {
    entidad = await Evento.findById(entidadId);
    if (!entidad || !entidad.activo) {
        return res.status(404).json({
        success: false,
        error: 'Evento no encontrado'
        });
    }
    } else {
    entidad = await MegaEvento.findById(entidadId);
    if (!entidad || !entidad.activo) {
        return res.status(404).json({
        success: false,
        error: 'Mega evento no encontrado'
        });
    }
    }

    // Obtener información adicional del usuario desde SQL Server
    const pool = await poolPromise;
    let infoUsuario = {
    nombre: mongoUser.nombre_usuario,
    email: mongoUser.correo,
    avatar: '',
    tipoUsuario: tipoUsuario
    };

    try {
    // Obtener información específica según el tipo de usuario
    switch (tipoUsuario) {
        case 'Empresa':
        const empresaResult = await pool.request()
            .input('id_usuario', usuarioId)
            .query('SELECT nombre_empresa FROM empresas WHERE id_usuario = @id_usuario');
        if (empresaResult.recordset.length > 0) {
            infoUsuario.nombre = empresaResult.recordset[0].nombre_empresa;
        }
        break;
        case 'ONG':
        const ongResult = await pool.request()
            .input('id_usuario', usuarioId)
            .query('SELECT nombre_ong FROM ongs WHERE id_usuario = @id_usuario');
        if (ongResult.recordset.length > 0) {
            infoUsuario.nombre = ongResult.recordset[0].nombre_ong;
        }
        break;
        case 'Integrante externo':
        const integranteResult = await pool.request()
            .input('id_usuario', usuarioId)
            .query('SELECT nombres, apellidos FROM integrantes_externos WHERE id_usuario = @id_usuario');
        if (integranteResult.recordset.length > 0) {
            const integrante = integranteResult.recordset[0];
            infoUsuario.nombre = `${integrante.nombres} ${integrante.apellidos}`;
        }
        break;
    }
    } catch (sqlError) {
    console.error('Error obteniendo información del usuario desde SQL:', sqlError);
    // Continuar con la información básica de MongoDB
    }

    // Convertir avatar a base64 si existe
    if (mongoUser.avatar && mongoUser.avatar.length > 0) {
    infoUsuario.avatar = `data:image/jpeg;base64,${mongoUser.avatar.toString('base64')}`;
    }

    // Verificar si ya existe un like
    const likeExistente = await Like.findOne({
    tipoEntidad,
    entidadId,
    usuarioId: usuarioId.toString(),
    tipoUsuario,
    activo: true
    });

    let accion;
    let totalLikes;

    if (likeExistente) {
    // Eliminar el like completamente de MongoDB
    await Like.findByIdAndDelete(likeExistente._id);
    accion = 'like_removido';
    } else {
    // Agregar like
    const nuevoLike = new Like({
        tipoEntidad,
        entidadId,
        usuarioId: usuarioId.toString(),
        tipoUsuario,
        infoUsuario,
        metadata: {
        ip: req.ip,
        userAgent: req.get('User-Agent')
        }
    });

    await nuevoLike.save();
    accion = 'like_agregado';
    }

    // Contar likes totales
    totalLikes = await Like.contarLikes(tipoEntidad, entidadId);

    res.json({
    success: true,
    accion,
    totalLikes,
    usuario: {
        id: usuarioId,
        tipo: tipoUsuario,
        nombre: infoUsuario.nombre
    }
    });

    } catch (error) {
    console.error('Error en toggleLike:', error);
    res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
    });
    }
    }

  // Obtener likes de un evento en espesífico ya sea evento o mega eventos 
  async getLikes(req, res) {
    try {
      const { tipoEntidad, entidadId } = req.params;
      const { pagina = 1, limite = 20 } = req.query;

      const skip = (parseInt(pagina) - 1) * parseInt(limite);

      const likes = await Like.find({
        tipoEntidad,
        entidadId,
        activo: true
      })
      .sort({ fechaLike: -1 })
      .skip(skip)
      .limit(parseInt(limite))
      .lean();

      const totalLikes = await Like.contarLikes(tipoEntidad, entidadId);

      res.json({
        success: true,
        likes: likes.map(like => ({
          id: like._id,
          usuario: {
            id: like.usuarioId,
            tipo: like.tipoUsuario,
            nombre: like.infoUsuario.nombre,
            avatar: like.infoUsuario.avatar
          },
          fecha: like.fechaLike
        })),
        totalLikes,
        paginacion: {
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          total: totalLikes,
          totalPaginas: Math.ceil(totalLikes / parseInt(limite))
        }
      });

    } catch (error) {
      console.error('Error en getLikes:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener likes'
      });
    }
  }

  // Verificar si un usuario ya dio like
  async checkUserLike(req, res) {
    try {
      const { tipoEntidad, entidadId } = req.params;
      
      // Obtener usuario autenticado
      const mongoUser = await User.findById(req.user.userId);
      if (!mongoUser) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      const like = await Like.verificarLike(
        tipoEntidad,
        entidadId,
        mongoUser.sqlUserId.toString(),
        mongoUser.tipo_usuario
      );

      res.json({
        success: true,
        hasLike: !!like,
        fechaLike: like ? like.fechaLike : null
      });

    } catch (error) {
      console.error('Error en checkUserLike:', error);
      res.status(500).json({
        success: false,
        error: 'Error al verificar like'
      });
    }
  }

  // Obtener estadísticas de likes
  async getLikeStatistics(req, res) {
    try {
      const { tipoEntidad, entidadId } = req.params;

      const estadisticas = await Like.obtenerEstadisticasPorTipo(tipoEntidad, new mongoose.Types.ObjectId(entidadId));
      const totalLikes = await Like.contarLikes(tipoEntidad, entidadId);

      // Estadísticas por días
      const likesUltimos7Dias = await Like.aggregate([
        {
          $match: {
            tipoEntidad,
            entidadId: new mongoose.Types.ObjectId(entidadId),
            activo: true,
            fechaLike: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$fechaLike" }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id": 1 } }
      ]);

      res.json({
        success: true,
        estadisticas: {
          totalLikes,
          likesPorTipoUsuario: estadisticas.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          likesUltimos7Dias,
          promedioLikesPorDia: likesUltimos7Dias.length > 0 ? 
            likesUltimos7Dias.reduce((sum, day) => sum + day.count, 0) / 7 : 0
        }
      });

    } catch (error) {
      console.error('Error en getLikeStatistics:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estadísticas de likes'
      });
    }
  }

  // Obtener los eventos más populares (con más likes)
  async getMostLiked(req, res) {
    try {
      const { tipoEntidad, dias = 30, limite = 10 } = req.query;
      
      const fechaLimite = new Date(Date.now() - parseInt(dias) * 24 * 60 * 60 * 1000);
      
      const filtro = {
        activo: true,
        fechaLike: { $gte: fechaLimite }
      };
      
      if (tipoEntidad) {
        filtro.tipoEntidad = tipoEntidad;
      }

      const masPopulares = await Like.aggregate([
        { $match: filtro },
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
        { $sort: { totalLikes: -1 } },
        { $limit: parseInt(limite) }
      ]);

      // Obtener información adicional de las entidades
      const entidadesConInfo = await Promise.all(masPopulares.map(async (item) => {
        let entidadInfo = {};
        
        if (item._id.tipoEntidad === 'evento') {
          const evento = await Evento.findById(item._id.entidadId)
            .select('titulo fechaInicio estado ongId')
            .lean();
          entidadInfo = evento;
        } else {
          const megaEvento = await MegaEvento.findById(item._id.entidadId)
            .select('titulo fechaInicio estado ongOrganizadoraPrincipal')
            .lean();
          entidadInfo = megaEvento;
        }

        return {
          ...item,
          entidad: entidadInfo
        };
      }));

      res.json({
        success: true,
        entidadesMasPopulares: entidadesConInfo,
        filtros: {
          tipoEntidad: tipoEntidad || 'todos',
          dias: parseInt(dias),
          fechaDesde: fechaLimite
        }
      });

    } catch (error) {
      console.error('Error en getMostLiked:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener entidades más populares'
      });
    }
  }

  // Obtener mis likes
  async getMyLikes(req, res) {
    try {
      const { pagina = 1, limite = 20, tipoEntidad } = req.query;

      // Obtener usuario autenticado
      const mongoUser = await User.findById(req.user.userId);
      if (!mongoUser) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      const filtro = {
        usuarioId: mongoUser.sqlUserId.toString(),
        tipoUsuario: mongoUser.tipo_usuario,
        activo: true
      };

      if (tipoEntidad) {
        filtro.tipoEntidad = tipoEntidad;
      }

      const skip = (parseInt(pagina) - 1) * parseInt(limite);

      const likes = await Like.find(filtro)
        .sort({ fechaLike: -1 })
        .skip(skip)
        .limit(parseInt(limite))
        .lean();

      const total = await Like.countDocuments(filtro);

      // Obtener información de las entidades
      const likesConEntidades = await Promise.all(likes.map(async (like) => {
        let entidadInfo = {};
        
        if (like.tipoEntidad === 'evento') {
          const evento = await Evento.findById(like.entidadId)
            .select('titulo fechaInicio estado')
            .lean();
          entidadInfo = evento;
        } else {
          const megaEvento = await MegaEvento.findById(like.entidadId)
            .select('titulo fechaInicio estado')
            .lean();
          entidadInfo = megaEvento;
        }

        return {
          id: like._id,
          tipoEntidad: like.tipoEntidad,
          entidad: entidadInfo,
          fecha: like.fechaLike
        };
      }));

      res.json({
        success: true,
        likes: likesConEntidades,
        paginacion: {
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          total,
          totalPaginas: Math.ceil(total / parseInt(limite))
        }
      });

    } catch (error) {
      console.error('Error en getMyLikes:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener mis likes'
      });
    }
  }
}

module.exports = LikeController;