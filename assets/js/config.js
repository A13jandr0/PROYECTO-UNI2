// config.js
const API_BASE_URL = 'http://192.168.0.13:3000';


 const ESTADOS_MEGA_EVENTO = {
  PLANIFICACION: 'planificacion',
  CONVOCATORIA:  'convocatoria',
  ORGANIZACION:  'organizacion',
  EN_CURSO:      'en_curso',
  FINALIZADO:    'finalizado',
  CANCELADO:     'cancelado'
  //POSPUESTO:     'pospuesto'
};

const TAGS_PERMITIDOS = [
  'cultura', 'arte', 'educacion', 'salud', 'deporte',
  'tecnologia', 'medio_ambiente', 'inclusion', 'innovacion'
];