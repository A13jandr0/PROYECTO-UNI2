const Comment = require('../models/Comentario.model');
const Like = require('../models/Like.model');
const Evento = require('../models/evento.model');
const MegaEvento = require('../models/MegaEvento.model');
const User = require('../models/user');
const { poolPromise } = require('../config/db');
const { analizarSentimiento } = require('../utils/socialUtils');
const mongoose = require('mongoose');

const determinarRol = (tipoUsuario) => {
  switch (tipoUsuario) {
    case 'Empresa': return 'representante';
    case 'ONG': return 'coordinador';
    case 'Integrante externo': return 'participante';
    default: return 'usuario';
  }
};
class CommentController {
  // Crear comentario
  async createComment(req, res) {
    try {
      const { tipoEntidad, entidadId } = req.params;
      const {
        contenido,
        categoria = 'general',
        comentarioPadreId = null
      } = req.body;

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

      // Validaciones básicas
      if (!contenido || contenido.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'El contenido del comentario es requerido'
        });
      }

      if (contenido.length > 2000) {
        return res.status(400).json({
          success: false,
          error: 'El comentario no puede exceder 2000 caracteres'
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

      // Obtener información del usuario desde SQL Server
      const pool = await poolPromise;
      let infoUsuario = {
        nombre: mongoUser.nombre_usuario,
        email: mongoUser.correo,
        avatar: '',
        rol: determinarRol(tipoUsuario)      };

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
              .query('SELECT nombres, apellidos, Email FROM integrantes_externos WHERE id_usuario = @id_usuario');
            if (integranteResult.recordset.length > 0) {
              const integrante = integranteResult.recordset[0];
              infoUsuario.nombre = `${integrante.nombres} ${integrante.apellidos}`;
              if (integrante.Email) {
                infoUsuario.email = integrante.Email;
              }
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

      // Análisis automático de sentimiento
      const sentimiento = analizarSentimiento(contenido);

      // Crear comentario
      const nuevoComentario = new Comment({
        tipoEntidad,
        entidadId,
        tipoUsuario,
        usuarioId: usuarioId.toString(),
        infoUsuario,
        contenido: contenido.trim(),
        categoria,
        sentimiento,
        comentarioPadreId,
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }
      });

      await nuevoComentario.save();

      res.status(201).json({
        success: true,
        message: 'Comentario creado exitosamente',
        comentario: {
          id: nuevoComentario._id,
          contenido: nuevoComentario.contenido,
          categoria: nuevoComentario.categoria,
          sentimiento: nuevoComentario.sentimiento,
          usuario: infoUsuario,
          fecha: nuevoComentario.fechaComentario,
          likes: 0,
          respuestas: []
        }
      });

    } catch (error) {
      console.error('Error en createComment:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  }

  // Obtener comentarios de una entidad
  async getComments(req, res) {
    try {
      const { tipoEntidad, entidadId } = req.params;
      const { 
        pagina = 1, 
        limite = 10, 
        categoria, 
        sentimiento, 
        ordenar = 'reciente' 
      } = req.query;

      const filtros = {
        tipoEntidad,
        entidadId,
        estado: { $in: ['activo', 'aprobado'] },
        comentarioPadreId: null // Solo comentarios principales
      };

      if (categoria) filtros.categoria = categoria;
      if (sentimiento) filtros.sentimiento = sentimiento;

      let ordenamiento = { fechaComentario: -1 };
      if (ordenar === 'popular') {
        ordenamiento = { likes: -1, fechaComentario: -1 };
      } else if (ordenar === 'antiguo') {
        ordenamiento = { fechaComentario: 1 };
      }

      const skip = (parseInt(pagina) - 1) * parseInt(limite);

      const comentarios = await Comment.find(filtros)
        .sort(ordenamiento)
        .skip(skip)
        .limit(parseInt(limite))
        .lean();

      const total = await Comment.countDocuments(filtros);

      // Obtener respuestas para cada comentario
      const comentariosConRespuestas = await Promise.all(comentarios.map(async (comentario) => {
        const respuestas = await Comment.find({
          comentarioPadreId: comentario._id,
          estado: { $in: ['activo', 'aprobado'] }
        })
        .sort({ fechaComentario: 1 })
        .limit(5) // Limitar respuestas mostradas
        .lean();

        return {
          ...comentario,
          respuestas: respuestas.map(resp => ({
            id: resp._id,
            contenido: resp.contenido,
            usuario: resp.infoUsuario,
            fecha: resp.fechaComentario,
            likes: resp.likes
          })),
          totalRespuestas: await Comment.countDocuments({
            comentarioPadreId: comentario._id,
            estado: { $in: ['activo', 'aprobado'] }
          })
        };
      }));

      res.json({
        success: true,
        comentarios: comentariosConRespuestas.map(comentario => ({
          id: comentario._id,
          contenido: comentario.contenido,
          categoria: comentario.categoria,
          sentimiento: comentario.sentimiento,
          usuario: comentario.infoUsuario,
          fecha: comentario.fechaComentario,
          likes: comentario.likes,
          respuestas: comentario.respuestas,
          totalRespuestas: comentario.totalRespuestas,
          editado: comentario.metadata?.editado || false
        })),
        paginacion: {
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          total,
          totalPaginas: Math.ceil(total / parseInt(limite))
        },
        filtros: {
          categoria,
          sentimiento,
          ordenar
        }
      });

    } catch (error) {
      console.error('Error en getComments:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener comentarios'
      });
    }
  }

  // Responder a un comentario
  async replyToComment(req, res) {
    try {
      const { comentarioId } = req.params;
      const { contenido } = req.body;

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

      if (!contenido || contenido.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'El contenido de la respuesta es requerido'
        });
      }

      // Verificar que el comentario padre existe
      const comentarioPadre = await Comment.findById(comentarioId);
      if (!comentarioPadre) {
        return res.status(404).json({
          success: false,
          error: 'Comentario no encontrado'
        });
      }

      // Obtener información del usuario desde SQL Server
      const pool = await poolPromise;
      let infoUsuario = {
        nombre: mongoUser.nombre_usuario,
        email: mongoUser.correo,
        avatar: '',
        rol: determinarRol(tipoUsuario)
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
              .query('SELECT nombres, apellidos, Email FROM integrantes_externos WHERE id_usuario = @id_usuario');
            if (integranteResult.recordset.length > 0) {
              const integrante = integranteResult.recordset[0];
              infoUsuario.nombre = `${integrante.nombres} ${integrante.apellidos}`;
              if (integrante.Email) {
                infoUsuario.email = integrante.Email;
              }
            }
            break;
        }
      } catch (sqlError) {
        console.error('Error obteniendo información del usuario desde SQL:', sqlError);
      }

      // Convertir avatar a base64 si existe
      if (mongoUser.avatar && mongoUser.avatar.length > 0) {
        infoUsuario.avatar = `data:image/jpeg;base64,${mongoUser.avatar.toString('base64')}`;
      }

      // Crear respuesta
      const respuestaData = {
        tipoUsuario,
        usuarioId: usuarioId.toString(),
        infoUsuario,
        contenido: contenido.trim()
      };

      await comentarioPadre.agregarRespuesta(respuestaData);

      res.json({
        success: true,
        message: 'Respuesta agregada exitosamente',
        respuesta: {
          contenido: respuestaData.contenido,
          usuario: infoUsuario,
          fecha: new Date(),
          likes: 0
        }
      });

    } catch (error) {
      console.error('Error en replyToComment:', error);
      res.status(500).json({
        success: false,
        error: 'Error al agregar respuesta'
      });
    }
  }

  // Dar like a un comentario
  async likeComment(req, res) {
    try {
      const { comentarioId } = req.params;

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

      const comentario = await Comment.findById(comentarioId);
      if (!comentario) {
        return res.status(404).json({
          success: false,
          error: 'Comentario no encontrado'
        });
      }

      // Obtener información del usuario desde SQL Server
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
              .query('SELECT nombres, apellidos, Email FROM integrantes_externos WHERE id_usuario = @id_usuario');
            if (integranteResult.recordset.length > 0) {
              const integrante = integranteResult.recordset[0];
              infoUsuario.nombre = `${integrante.nombres} ${integrante.apellidos}`;
              if (integrante.Email) {
                infoUsuario.email = integrante.Email;
              }
            }
            break;
        }
      } catch (sqlError) {
        console.error('Error obteniendo información del usuario desde SQL:', sqlError);
      }

      // Convertir avatar a base64 si existe
      if (mongoUser.avatar && mongoUser.avatar.length > 0) {
        infoUsuario.avatar = `data:image/jpeg;base64,${mongoUser.avatar.toString('base64')}`;
      }

      // Crear un like específico para comentarios usando el modelo Like
      const likeExistente = await Like.findOne({
        tipoEntidad: 'comentario',
        entidadId: comentarioId,
        usuarioId: usuarioId.toString(),
        tipoUsuario,
        activo: true
      });

      if (likeExistente) {
        // Quitar like
        likeExistente.activo = false;
        await likeExistente.save();
        comentario.likes = Math.max(0, comentario.likes - 1);
      } else {
        // Agregar like
        const nuevoLike = new Like({
          tipoEntidad: 'comentario',
          entidadId: comentarioId,
          usuarioId: usuarioId.toString(),
          tipoUsuario,
          infoUsuario
        });
        await nuevoLike.save();
        comentario.likes += 1;
      }

      await comentario.save();

      res.json({
        success: true,
        accion: likeExistente ? 'like_removido' : 'like_agregado',
        totalLikes: comentario.likes
      });

    } catch (error) {
      console.error('Error en likeComment:', error);
      res.status(500).json({
        success: false,
        error: 'Error al procesar like del comentario'
      });
    }
  }

  // Editar comentario
  async editComment(req, res) {
    try {
      const { comentarioId } = req.params;
      const { nuevoContenido } = req.body;

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

      if (!nuevoContenido || nuevoContenido.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'El nuevo contenido es requerido'
        });
      }

      const comentario = await Comment.findById(comentarioId);
      if (!comentario) {
        return res.status(404).json({
          success: false,
          error: 'Comentario no encontrado'
        });
      }

      // Verificar que el usuario es el autor del comentario
      if (comentario.usuarioId !== usuarioId.toString() || comentario.tipoUsuario !== tipoUsuario) {
        return res.status(403).json({
          success: false,
          error: 'No autorizado para editar este comentario'
        });
      }

      // Verificar tiempo límite de edición (24 horas)
      const tiempoLimite = 24 * 60 * 60 * 1000; // 24 horas en ms
      if (Date.now() - comentario.fechaComentario.getTime() > tiempoLimite) {
        return res.status(400).json({
          success: false,
          error: 'Ya no se puede editar este comentario (límite de 24 horas)'
        });
      }

      await comentario.marcarComoEditado(nuevoContenido.trim());

      res.json({
        success: true,
        message: 'Comentario editado exitosamente',
        comentario: {
          id: comentario._id,
          contenido: comentario.contenido,
          editado: true,
          fechaEdicion: comentario.metadata.fechaEdicion
        }
      });

    } catch (error) {
      console.error('Error en editComment:', error);
      res.status(500).json({
        success: false,
        error: 'Error al editar comentario'
      });
    }
  }

  // Reportar comentario
  async reportComment(req, res) {
    try {
      const { comentarioId } = req.params;
      const { motivo, descripcion } = req.body;

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

      const comentario = await Comment.findById(comentarioId);
      if (!comentario) {
        return res.status(404).json({
          success: false,
          error: 'Comentario no encontrado'
        });
      }

      const reporteData = {
        usuarioId: usuarioId.toString(),
        tipoUsuario,
        motivo,
        descripcion: descripcion || ''
      };

      await comentario.reportar(reporteData);

      res.json({
        success: true,
        message: 'Comentario reportado exitosamente',
        totalReportes: comentario.reportes.length
      });

    } catch (error) {
      console.error('Error en reportComment:', error);
      res.status(500).json({
        success: false,
        error: 'Error al reportar comentario'
      });
    }
  }

  // Eliminar comentario
  async deleteComment(req, res) {
    try {
      const { comentarioId } = req.params;

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

      const comentario = await Comment.findById(comentarioId);
      if (!comentario) {
        return res.status(404).json({
          success: false,
          error: 'Comentario no encontrado'
        });
      }

      // Verificar que el usuario es el autor del comentario
      if (comentario.usuarioId !== usuarioId.toString() || comentario.tipoUsuario !== tipoUsuario) {
        return res.status(403).json({
          success: false,
          error: 'No autorizado para eliminar este comentario'
        });
      }

      comentario.estado = 'eliminado';
      await comentario.save();

      res.json({
        success: true,
        message: 'Comentario eliminado exitosamente'
      });

    } catch (error) {
      console.error('Error en deleteComment:', error);
      res.status(500).json({
        success: false,
        error: 'Error al eliminar comentario'
      });
    }
  }

  // Obtener estadísticas de comentarios
  async getCommentStatistics(req, res) {
    try {
      const { tipoEntidad, entidadId } = req.params;

      const totalComentarios = await Comment.contarComentarios(tipoEntidad, entidadId);
      
      const estadisticasSentimiento = await Comment.estadisticasSentimiento(tipoEntidad, entidadId);
      
      const comentariosPorCategoria = await Comment.aggregate([
        {
          $match: {
            tipoEntidad,
            entidadId: new mongoose.Types.ObjectId(entidadId),
            estado: { $in: ['activo', 'aprobado'] }
          }
        },
        {
          $group: {
            _id: '$categoria',
            count: { $sum: 1 }
          }
        }
      ]);

      const comentariosPorTipoUsuario = await Comment.aggregate([
        {
          $match: {
            tipoEntidad,
            entidadId: new mongoose.Types.ObjectId(entidadId),
            estado: { $in: ['activo', 'aprobado'] }
          }
        },
        {
          $group: {
            _id: '$tipoUsuario',
            count: { $sum: 1 }
          }
        }
      ]);

      res.json({
        success: true,
        estadisticas: {
          totalComentarios,
          sentimiento: estadisticasSentimiento.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          categorias: comentariosPorCategoria.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          tiposUsuario: comentariosPorTipoUsuario.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {})
        }
      });

    } catch (error) {
      console.error('Error en getCommentStatistics:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estadísticas de comentarios'
      });
    }
  }

  // Obtener mis comentarios
  async getMyComments(req, res) {
    try {
      const { pagina = 1, limite = 10, estado = 'activo' } = req.query;

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

      const filtros = {
        usuarioId: usuarioId.toString(),
        tipoUsuario,
        estado: { $in: ['activo', 'aprobado'] }
      };

      if (estado !== 'todos') {
        filtros.estado = estado;
      }

      const skip = (parseInt(pagina) - 1) * parseInt(limite);

      const comentarios = await Comment.find(filtros)
        .sort({ fechaComentario: -1 })
        .skip(skip)
        .limit(parseInt(limite))
        .lean();

      const total = await Comment.countDocuments(filtros);

      res.json({
        success: true,
        comentarios: comentarios.map(comentario => ({
          id: comentario._id,
          contenido: comentario.contenido,
          categoria: comentario.categoria,
          sentimiento: comentario.sentimiento,
          tipoEntidad: comentario.tipoEntidad,
          entidadId: comentario.entidadId,
          fecha: comentario.fechaComentario,
          likes: comentario.likes,
          estado: comentario.estado,
          editado: comentario.metadata?.editado || false
        })),
        paginacion: {
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          total,
          totalPaginas: Math.ceil(total / parseInt(limite))
        }
      });

    } catch (error) {
      console.error('Error en getMyComments:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener mis comentarios'
      });
    }
  }

}

module.exports = CommentController;