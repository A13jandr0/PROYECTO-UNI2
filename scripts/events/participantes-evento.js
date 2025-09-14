/* scripts/events/participantes-evento.js
   Se encarga de:
   1) Leer eventoId de la URL
   2) Obtener ongId (sqlUserId) y token desde localStorage
   3) Hacer fetch a /api/events/:eventoId/participantes?ongId=<ongId>
   4) Renderizar métricas y lista de participantes en pantalla
*/

(async () => {
  const token        = localStorage.getItem('token');
  const tipoUsuario  = localStorage.getItem('tipo_usuario');
  const sqlUserIdStr = localStorage.getItem('sqlUserId');
  const sqlUserId    = sqlUserIdStr ? parseInt(sqlUserIdStr, 10) : null;

  // 1) Verificar que haya token
  if (!token) {
    window.location.href = '../../index.html';
    return;
  }

  // 2) Leer eventoId desde query string
  const qs       = new URLSearchParams(window.location.search);
  const eventoId = qs.get('eventoId');
  if (!eventoId) {
    document.getElementById('mensajeContainer').textContent =
      'No se indicó un evento.';
    return;
  }

  // 3) Intentar obtener participantes
  try {
    // Construir URL con ongId en query
    // Asumimos que sólo ONG dueña tendrá permiso en el back-end
    const ongId = sqlUserId;
    const resp = await fetch(
      `${API_BASE_URL}/api/events/${eventoId}/participantes?ongId=${ongId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.error || 'Error al cargar participantes');
    }

    // 4) Renderizar métricas
    const { participantes, totalParticipantes, metricas } = data;
    document.getElementById('totalInscritos').textContent     = metricas.totalInscritos ?? totalParticipantes;
    document.getElementById('totalAsistentes').textContent    = metricas.totalAsistentes ?? '0';
    document.getElementById('porcentajeAsistencia').textContent = 
      (metricas.porcentajeAsistencia != null) 
        ? `${metricas.porcentajeAsistencia}%` 
        : '0%';

    document.getElementById('metricasContainer').classList.remove('hidden');

    // 5) Renderizar tabla de participantes
    const tbody = document.getElementById('participantesBody');
    tbody.innerHTML = ''; // Limpiar, por si acaso

    if (Array.isArray(participantes) && participantes.length > 0) {
      participantes.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.className = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';

        // Cada fila tiene: número, integranteId, tipoParticipante, asistencia
        tr.innerHTML = `
          <td class="py-2 px-4 text-gray-700">${idx + 1}</td>
          <td class="py-2 px-4 text-gray-700">${p.integranteId}</td>
          <td class="py-2 px-4 text-gray-700">${p.tipoParticipante || '–'}</td>
          <td class="py-2 px-4 text-gray-700">
            ${p.asistencia === true ? '✔ Sí' : (p.asistencia === false ? '✘ No' : '–')}
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      // Si no hay participantes, mostrar un mensaje
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-4 px-4 text-center text-gray-500" colspan="4">
          No hay participantes registrados.
        </td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('participantesContainer').classList.remove('hidden');
  }
  catch (err) {
    console.error('Error obteniendo participantes:', err);
    document.getElementById('mensajeContainer').textContent =
      err.message || 'No se pudo cargar la lista de participantes.';
  }

  // 6) Botón “Volver”
  document.getElementById('volverBtn').addEventListener('click', () => {
    history.back();
  });

})();

