const { Router } = require('express');
const LikeController = require('../controllers/likes.controller');
const { authenticateToken } = require('../middleware/auth');

const router = Router();
const likeController = new LikeController();

// ================ RUTAS PARA LIKES ================

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// Toggle like/unlike en una entidad (evento o mega evento)
router.post('/:tipoEntidad/:entidadId/toggle', likeController.toggleLike);

// Obtener todos los likes de una entidad con paginación
router.get('/:tipoEntidad/:entidadId', likeController.getLikes);

// Verificar si el usuario autenticado ya dio like a una entidad
// CAMBIADO: Ya no necesita parámetros de usuario, usa el usuario autenticado
router.get('/:tipoEntidad/:entidadId/check', likeController.checkUserLike);

// Obtener estadísticas detalladas de likes de una entidad
router.get('/:tipoEntidad/:entidadId/statistics', likeController.getLikeStatistics);

// Obtener las entidades más populares (con más likes)
router.get('/most-liked', likeController.getMostLiked);

// Obtener mis likes (usuario autenticado)
// CAMBIADO: Ya no necesita parámetros de usuario, usa el usuario autenticado
router.get('/my-likes', likeController.getMyLikes);

module.exports = router;