// scripts/events/participaciones.js

(async () => {
  // 0) Obtener datos de sesión
  const token = localStorage.getItem('token');
  const tipoUsuario = localStorage.getItem('tipo_usuario');
  const integranteId = localStorage.getItem('id_usuario');
  const contenedor = document.getElementById('eventosList');

  // 1) Validar acceso: sólo "Integrante externo" puede ver esta página
  if (!token || tipoUsuario !== 'Integrante externo' || !integranteId) {
    contenedor.innerHTML = `
      <p class="text-center text-red-500">
        Acceso no autorizado. Inicia sesión como Integrante externo.
      </p>`;
    return;
  }

  // 2) Hacer fetch al endpoint de participaciones
  try {
    const resp = await fetch(
      `${API_BASE_URL}/api/events/integrantes/${integranteId}/participaciones`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const json = await resp.json();
    if (!resp.ok || !json.success) {
      throw new Error(json.error || 'Error al obtener tus participaciones');
    }

    const eventos = json.eventos;

    // 3) Si no hay participaciones, mensaje
    if (!Array.isArray(eventos) || eventos.length === 0) {
      contenedor.innerHTML = `
        <p class="text-center text-gray-500">
          Aún no estás inscrito en ningún evento.
        </p>`;
      return;
    }

    // 4) Renderizar cada evento
    contenedor.innerHTML = ''; // limpiar mientras agregamos

    eventos.forEach(ev => {
      // 4.1) Si existe imagen principal, úsala; si no, placeholder
      const imgHtml = ev.imagenPrincipal?.url
        ? `<img src="${ev.imagenPrincipal.url}"
                alt="Imagen de ${ev.titulo}"
                class="w-full h-48 object-cover rounded-t-lg">`
        : `
          <div class="w-full h-48 bg-gray-200 flex items-center justify-center text-gray-400 rounded-t-lg">
            Sin imagen
          </div>`;

      // 4.2) Formatear fecha
      const fecha = new Date(ev.fechaInicio).toLocaleDateString();

      // 4.3) Estado de asistencia
      const asistenciaText = ev.participacion.asistencia
        ? '✅ Asististe'
        : '❌ No asististe';

      // 4.4) Construir tarjeta
      const tarjeta = document.createElement('div');
      tarjeta.className = `
        bg-white shadow-md rounded-lg overflow-hidden
        hover:shadow-lg transition-colors
      `;
      tarjeta.innerHTML = `
        ${imgHtml}
        <div class="p-4">
          <h2 class="text-xl font-semibold mb-2 line-clamp-1">${ev.titulo}</h2>
          <p class="text-sm text-gray-700 mb-1">
            <strong>Fecha:</strong> ${fecha}
          </p>
          ${ ev.locacion?.ciudad
              ? `<p class="text-sm text-gray-700 mb-1">
                  <strong>Ciudad:</strong> ${ev.locacion.ciudad}
                </p>`
              : ''
          }
          <p class="text-sm text-gray-700 mb-1">
            <strong>Rol:</strong> Participante
          </p>
          <p class="text-sm text-gray-700 mb-2">${asistenciaText}</p>

          <a href="../pages/event/detalle.html?eventoId=${ev._id}"
             class="inline-block mt-2 text-white bg-brand-cian hover:bg-brand-profundo
                    font-medium text-sm px-4 py-2 rounded transition">
            Ver detalle
          </a>
        </div>
      `;

      contenedor.appendChild(tarjeta);
    });

  } catch (err) {
    console.error(err);
    contenedor.innerHTML = `
      <p class="text-center text-red-500">
        Error al cargar tus eventos: ${err.message}
      </p>`;
  }
})();
