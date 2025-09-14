// 1) Precondiciones
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '../../index.html';
  throw new Error('Falta token de autenticación');
}
const ongId = Number(localStorage.getItem('sqlUserId'));

// 2) Al cargar la página: lee el megaEventoId y busca stats
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('megaEventoId');
  if (!id) {
    document.getElementById('titulo').innerText = 'ID de evento faltante';
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/mega-eventos/${id}/estadisticas?ongId=${ongId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    const { success, estadisticas, error } = await res.json();
    if (!success) throw new Error(error || res.statusText);

    renderStats(estadisticas);
  } catch (err) {
    console.error(err);
    document.getElementById('titulo').innerText = 'Error al cargar estadísticas';
    document.getElementById('statsContainer').innerHTML =
      `<p class="text-red-600 text-center">${err.message}</p>`;
  }
});

// 3) Función para renderizar en el DOM
function renderStats(s) {
  // Título con nombre y estado
  document.getElementById('titulo').innerText =
    `${s.megaEvento.titulo} — Estadísticas`;

  const container = document.getElementById('statsContainer');
  container.innerHTML = '';

  // -- Sección: Información básica del evento
  const info = document.createElement('div');
  info.className = 'space-y-1';
  info.innerHTML = `
    <h2 class="text-2xl font-semibold">Información del evento</h2>
    <p><strong>Estado:</strong> ${s.megaEvento.estado}</p>
    <p><strong>Fecha inicio:</strong> ${new Date(s.megaEvento.fechaInicio).toLocaleString()}</p>
  `;
  container.appendChild(info);

  // -- Participación
  const part = document.createElement('div');
  part.className = 'space-y-1';
  part.innerHTML = `
    <h2 class="text-2xl font-semibold">Participación</h2>
    <p><strong>Total inscritos:</strong> ${s.participacion.totalParticipantes}</p>
    <p><strong>Capacidad máxima:</strong> ${s.participacion.capacidadMaxima ?? '—'}</p>
    <p><strong>Espacios disponibles:</strong> ${s.participacion.espaciosDisponibles ?? '—'}</p>
  `;
  // lista por tipo
  const ulP = document.createElement('ul');
  ulP.className = 'list-disc list-inside ml-4';
  for (const [tipo, total] of Object.entries(s.participacion.participantesPorTipo)) {
    const li = document.createElement('li');
    li.innerText = `${tipo}: ${total}`;
    ulP.appendChild(li);
  }
  part.appendChild(ulP);
  container.appendChild(part);

  // -- Patrocinio
  const patro = document.createElement('div');
  patro.className = 'space-y-1';
  patro.innerHTML = `
    <h2 class="text-2xl font-semibold">Patrocinio</h2>
    <p><strong>Total patrocinadores:</strong> ${s.patrocinio.totalPatrocinadores}</p>
    <p><strong>Monto recaudado:</strong> ${s.patrocinio.montoTotalRecaudado}</p>
  `;
  const ulPat = document.createElement('ul');
  ulPat.className = 'list-disc list-inside ml-4';
  for (const [tipo, infoTipo] of Object.entries(s.patrocinio.patrocinadoresPorTipo)) {
    const li = document.createElement('li');
    li.innerText = `${tipo}: ${infoTipo.total} (${infoTipo.montoTotal} monto total)`;
    ulPat.appendChild(li);
  }
  patro.appendChild(ulPat);
  container.appendChild(patro);

  // -- Organización
  const org = document.createElement('div');
  org.className = 'space-y-1';
  org.innerHTML = `
    <h2 class="text-2xl font-semibold">Organización</h2>
    <p><strong>ONGs organizadoras:</strong> ${s.organizacion.totalOngsOrganizadoras}</p>
  `;
  container.appendChild(org);

  // -- Contenido
  const cont = document.createElement('div');
  cont.className = 'space-y-1';
  cont.innerHTML = `
    <h2 class="text-2xl font-semibold">Contenido</h2>
    <p><strong>Imágenes promocionales:</strong> ${s.contenido.totalImagenes}</p>
  `;
  container.appendChild(cont);
}
