const express = require('express');
const router = express.Router();
const multer  = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const {
    crearInvitadoEspecial,//
    obtenerInvitados,
    obtenerInvitadoPorId,
    obtenerHistorialInvitado,
    actualizarInvitadoEspecial,
    buscarOCrearInvitado,//
    agregarInvitadosAEvento,
    agregarInvitadosAMegaEvento,
    registrarAsistencia,
    obtenerInvitadosEvento,
    obtenerInvitadosMegaEvento,
    eliminarInvitadoDeEvento,
    eliminarInvitadoDeMegaEvento,
    cambiarEstadoInvitacion,
    actualizarEstadoInvitacion

} = require('../controllers/list.controller');

router.post('/', crearInvitadoEspecial);
router.get('/', obtenerInvitados);
router.get('/:identificador', obtenerInvitadoPorId);
router.put('/:id', actualizarInvitadoEspecial);
router.get('/historial/:cedula', obtenerHistorialInvitado);

router.post('/buscar-o-crear', buscarOCrearInvitado);

router.patch(
  '/evento/:eventoId/invitado/:invitadoId/estado',
  cambiarEstadoInvitacion
);

router.patch('/evento/:eventoId/invitado/:invitadoId/estado', actualizarEstadoInvitacion);


router.post('/evento/:eventoId/crear-lista', upload.single('foto'), agregarInvitadosAEvento);


router.post('/mega-evento/:megaEventoId/crear-lista', agregarInvitadosAMegaEvento);

router.get('/evento/:eventoId', obtenerInvitadosEvento);
router.get('/mega-evento/:megaEventoId', obtenerInvitadosMegaEvento);



router.post('/asistencia', registrarAsistencia);

router.delete('/evento/:eventoId/invitado/:invitadoId', eliminarInvitadoDeEvento);
router.delete('/mega-evento/:megaEventoId/invitado/:invitadoId', eliminarInvitadoDeMegaEvento);


router.post('/mega-evento/:megaEventoId/agregar', agregarInvitadosAMegaEvento);

module.exports = router;