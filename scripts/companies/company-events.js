// scripts/company-events.js

(async () => {
  const token       = localStorage.getItem('token');
  const tipoUsuario = localStorage.getItem('tipo_usuario');
  const empresaId   = parseInt(localStorage.getItem('sqlUserId'), 10);

  if (!token || tipoUsuario !== 'Empresa') {
    // Si no hay token o no eres Empresa, redirige al login
    window.location.href = 'index.html';
    return;
  }

  const container = document.getElementById('eventsContainer');
  container.innerHTML = '<p class="col-span-full text-center text-white/80">Cargando…</p>';

  try {
    // Llamada a /api/events/empresas/:empresaId/eventos
    const res  = await fetch(`${API_BASE_URL}/api/events/empresas/${empresaId}/eventos?tipo=todos`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error al obtener eventos');

    container.innerHTML = '';
    if (json.eventos.length === 0) {
      container.innerHTML = '<p class="col-span-full text-center text-white/80">No hay eventos.</p>';
      return;
    }

    // Por cada evento, dibuja una tarjeta
    json.eventos.forEach(ev => {
      const card = document.createElement('div');
      card.className = `
        bg-white/90 rounded-2xl shadow hover:shadow-lg transition
        overflow-hidden cursor-pointer flex flex-col
      `;

      // Imagen principal (si existe)
      const imgHtml = ev.imagenPrincipal?.url
        ? `<img src="${ev.imagenPrincipal.url}" class="h-40 w-full object-cover">`
        : `<div class="h-40 w-full flex items-center justify-center bg-gray-200 text-gray-500">Sin imagen</div>`;

      // Cuerpo con título, fecha y tipo de participación
      const bodyHtml = `
        <div class="p-4 flex-1 flex flex-col">
          <h3 class="text-brand-profundo font-semibold text-lg mb-1 line-clamp-2">${ev.titulo}</h3>
          <p class="text-sm text-gray-700 mb-1">
            <strong>Fecha:</strong> ${new Date(ev.fechaInicio).toLocaleDateString()}
          </p>
          <span class="self-start mt-auto text-xs bg-brand-cian text-white px-2 py-0.5 rounded">
            ${ev.tipoParticipacion.charAt(0).toUpperCase() + ev.tipoParticipacion.slice(1)}
          </span>
        </div>
      `;

      card.innerHTML = imgHtml + bodyHtml;

      // Al hacer clic, ir al detalle del evento
      card.onclick = () => {
        window.location.href = `../pages/event/detalle.html?eventoId=${ev._id}`;
      };

      container.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="col-span-full text-center text-red-300">Error cargando eventos.</p>';
  }

  // Botón logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
  });
})();
