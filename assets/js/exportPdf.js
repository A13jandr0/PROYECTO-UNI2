export async function exportStatsToPDF(eventoId) {
  const { jsPDF } = window.jspdf;
  const ongId = Number(localStorage.getItem('sqlUserId'));

  // 1) Fetch con ongId
  const res = await fetch(
    `${API_BASE_URL}/api/events/${eventoId}/estadisticas?ongId=${ongId}`,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    }
  );
  if (res.status === 403) {
    return alert('No estás autorizado para exportar estas estadísticas.');
  }
  const { success, estadisticas: e, error } = await res.json();
  if (!success) {
    return alert('Error al obtener estadísticas: ' + error);
  }

  // 2) Preparamos filas para la tabla
  const rows = [];

  // KPIs Generales
  rows.push(['Éxito del evento', `${e.kpisGenerales.scoreExito.puntuacion}%`, e.kpisGenerales.scoreExito.nivel]);
  rows.push([
    'Días desde/hasta evento',
    e.kpisGenerales.esPasado
      ? `Hace ${e.kpisGenerales.diasDesdeEvento} días`
      : `${e.kpisGenerales.diasHastaEvento} días`,
    ''
  ]);

  // Participación
  rows.push(['Inscritos', e.participacion.totalInscritos, '']);
  rows.push(['Asistentes', e.participacion.totalAsistentes, '']);
  rows.push(['% Asistencia', `${e.participacion.porcentajeAsistencia}%`, '']);
  if (e.capacidad.capacidadMaxima) {
    rows.push(['Capacidad máxima', e.capacidad.capacidadMaxima, '']);
    rows.push(['Espacios disponibles', e.capacidad.espaciosDisponibles, '']);
    rows.push(['% Uso capacidad', `${e.capacidad.porcentajeCapacidad}%`, '']);
  }

  // Proyecciones
  if (e.proyecciones) {
    rows.push(['Inscripciones proyectadas', e.proyecciones.inscripcionesProyectadas, '']);
    rows.push(['Probabilidad de llenar', `${e.proyecciones.probabilidadLlenarCapacidad}%`, '']);
    rows.push(['Días para llenar', e.proyecciones.diasParaLlenar ?? '–', '']);
  }

  // Contenido multimedia
  rows.push(['Total imágenes', e.contenido.totalImagenes, '']);
  for (const [tipo, cnt] of Object.entries(e.contenido.tiposImagenes || {})) {
    rows.push([`Imágenes (${tipo})`, cnt, '']);
  }

  // Empresas
  rows.push(['Patrocinadoras', e.empresas.totalPatrocinadoras, '']);
  rows.push(['Auspiciadoras', e.empresas.totalAuspiciadoras, '']);

  // Tiempo y cambios
  rows.push(['Días desde creación', e.tiempo.diasDesdeCreacion, '']);
  rows.push(['Cambios de estado', e.tiempo.historialCambios, '']);

  // 3) Crear PDF
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  const tituloEvento = e.evento?.titulo || `Evento ${eventoId}`;
  doc.text(`Estadísticas del Evento: ${tituloEvento}`, 40, 40);

  doc.autoTable({
    startY: 60,
    head: [['Métrica', 'Valor', 'Detalle']],
    body: rows,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [22, 119, 255] }
  });

  // 4) Texto explicativo de columnas
  const explicacionY = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text('Explicación de columnas:', 40, explicacionY);
  doc.setFontSize(10);
  doc.text('• Métrica: Nombre del indicador o categoría medible.', 40, explicacionY + 16);
  doc.text('• Valor: Cantidad, porcentaje o valor numérico correspondiente.', 40, explicacionY + 32);
  doc.text('• Detalle: Nivel cualitativo o aclaración, si aplica (por ejemplo: "Bajo", "Alto").', 40, explicacionY + 48);

  // 5) Glosario de métricas claves
  const glosarioY = explicacionY + 72;
  doc.setFontSize(11);
  doc.text('Glosario de métricas clave:', 40, glosarioY);
  doc.setFontSize(10);
  doc.text('• Éxito del evento: Puntaje basado en asistencia (30%), capacidad (25%), engagement (20%),', 40, glosarioY + 16);
  doc.text('  contenido promocional (15%) y apoyo empresarial (10%).', 40, glosarioY + 32);
  doc.text('• Días desde/hasta evento: Días entre hoy y la fecha del evento (pasado o futuro).', 40, glosarioY + 48);
  doc.text('• Días desde creación: Tiempo desde que se creó el evento en la plataforma.', 40, glosarioY + 64);
  doc.text('• Cambios de estado: Número de veces que el evento cambió de estado (publicado, finalizado, etc).', 40, glosarioY + 80);

  // Para nombre de archivo, limpiamos caracteres no válidos
  const cleanTitulo = tituloEvento.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').toLowerCase();
  doc.save(`estadisticas_${cleanTitulo}.pdf`);
}
