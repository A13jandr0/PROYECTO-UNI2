const { Router } = require('express');
const CommentController = require('../controllers/comentarios.controller');
const { authenticateToken } = require('../middleware/auth');

const router = Router();
const commentController = new CommentController();

// ================ RUTAS PARA COMENTARIOS ================

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// Crear un nuevo comentario en una entidad (evento o mega evento)
router.post('/:tipoEntidad/:entidadId', commentController.createComment);

// Obtener todos los comentarios de una entidad con filtros y paginación
router.get('/:tipoEntidad/:entidadId', commentController.getComments);

// Responder a un comentario específico
router.post('/:comentarioId/reply', commentController.replyToComment);

// Dar o quitar like a un comentario
router.post('/:comentarioId/like', commentController.likeComment);

// Editar un comentario existente (solo el autor puede editarlo)
router.put('/:comentarioId/edit', commentController.editComment);

// Reportar un comentario por contenido inapropiado
router.post('/:comentarioId/report', commentController.reportComment);

// Eliminar un comentario (solo el autor puede eliminarlo)
router.delete('/:comentarioId', commentController.deleteComment);

// Obtener estadísticas de comentarios de una entidad
router.get('/:tipoEntidad/:entidadId/statistics', commentController.getCommentStatistics);//

// Obtener todos los comentarios del usuario autenticado
// CAMBIADO: Ya no necesita parámetros de usuario, usa el usuario autenticado
router.get('/my-comments', commentController.getMyComments);

module.exports = router;