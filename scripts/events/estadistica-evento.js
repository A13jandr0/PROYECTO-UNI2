/* ───────────── estadistica-evento.js ───────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const token       = localStorage.getItem('token');
  const ongId       = localStorage.getItem('sqlUserId');
  const tipoUsuario = localStorage.getItem('tipo_usuario');
  const qs          = new URLSearchParams(location.search);
  const eventoId    = qs.get('eventoId');

  // 🔒 Si no es ONG, ocultamos la sección y salimos
  const statsSection = document.getElementById('stats-container');
  if (tipoUsuario !== 'ONG') {
    if (statsSection) statsSection.style.display = 'none';
    return;
  }

  if (!token || !eventoId || !ongId) return;

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/events/${eventoId}/estadisticas?ongId=${ongId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.status === 403) {
      if (statsSection) statsSection.style.display = 'none';
      return;
    }

    const { estadisticas, success, error } = await res.json();
    if (!success) throw new Error(error);

    const e = estadisticas;

    // Evento
    document.getElementById('stats-titulo').textContent      = e.evento.titulo;
    document.getElementById('stats-fechaInicio').textContent = new Date(e.evento.fechaInicio).toLocaleString();
    document.getElementById('stats-estado').textContent      = e.evento.estado;

    // Participación
    document.getElementById('stats-totalInscritos').textContent       = e.participacion.totalInscritos;
    document.getElementById('stats-totalAsistentes').textContent      = e.participacion.totalAsistentes;
    document.getElementById('stats-porcentajeAsistencia').textContent = e.participacion.porcentajeAsistencia;
    document.getElementById('stats-capacidadMaxima').textContent      = e.participacion.capacidadMaxima ?? '–';
    document.getElementById('stats-espaciosDisponibles').textContent  = e.participacion.espaciosDisponibles ?? '–';

    const ulTiposP = document.getElementById('stats-participantesPorTipo');
    ulTiposP.innerHTML = '';
    Object.entries(e.participacion.participantesPorTipo).forEach(([tipo, cnt]) => {
      ulTiposP.insertAdjacentHTML('beforeend', `<li>${tipo}: ${cnt}</li>`);
    });

    // Contenido
    document.getElementById('stats-totalImagenes').textContent = e.contenido.totalImagenes;
    const ulTiposI = document.getElementById('stats-tiposImagenes');
    ulTiposI.innerHTML = '';
    Object.entries(e.contenido.tiposImagenes).forEach(([tipo, cnt]) => {
      ulTiposI.insertAdjacentHTML('beforeend', `<li>${tipo}: ${cnt}</li>`);
    });

    // Empresas
    document.getElementById('stats-totalPatrocinadoras').textContent = e.empresas.totalPatrocinadoras;
    document.getElementById('stats-totalAuspiciadoras').textContent  = e.empresas.totalAuspiciadoras;

  } catch (err) {
    console.error('No se pudieron cargar las estadísticas:', err);
    if (statsSection) statsSection.style.display = 'none';
  }
});
