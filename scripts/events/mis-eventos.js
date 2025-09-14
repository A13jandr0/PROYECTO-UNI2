// scripts/events/mis-eventos.js
// ================================================
// 1.  SEGURIDAD BÁSICA
// ================================================
const token       = localStorage.getItem('token');
const usuarioId   = localStorage.getItem('id_usuario');   // ← Id en tu BD
const tipoUsuario = localStorage.getItem('tipo_usuario') || '';

if (!token) {
  window.location.href = '../index.html';
  throw new Error('Sin token de autenticación');
}

// ================================================
// 2.  REFERENCIAS DOM  +  STATE
// ================================================
const feed     = document.getElementById('feed');
const sentinel = document.getElementById('sentinel');

let pagina     = 1;          // páginador backend
const limite   = 10;         // ítems por página
let totalPag   = Infinity;   // cantidad total de páginas (se recalcula)
let loading    = false;      // flag para evitar llamadas paralelas

document.addEventListener('DOMContentLoaded', () => loadMyEvents());

// ================================================
// 3.  CARGAR EVENTOS (paginado)
// ================================================
async function loadMyEvents(append = false) {
  // Sal de la función si ya estás cargando o si no quedan páginas
  if (loading || pagina > totalPag) return;
  loading = true;

  if (!append) feed.innerHTML = '<p class="text-center text-white/80">Cargando…</p>';

  // ---- 3.1  Construir endpoint según tipo de usuario ----
  const params = new URLSearchParams({ pagina, limite });    // ?pagina=…&limite=…
  let endpoint;

  if (tipoUsuario === 'Empresa') {
    // Endpoint para empresas: devuelve { success, eventos: [], total }
    endpoint = `${API_BASE_URL}/api/events/empresas/${usuarioId}/eventos?tipo=todos&${params.toString()}`;
  } else {
    // Endpoint para voluntarios/ONG: devuelve { success, eventos: { activos: […] }, resumen: { totalEventos } }
    endpoint = `${API_BASE_URL}/api/events/mis-eventos/${usuarioId}?${params.toString()}`;
  }

  // ---- 3.2  Llamada fetch ----
  try {
    const res  = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();

    if (!res.ok || !json.success) throw new Error(json.error || res.statusText);

    // ---- 3.3  Adaptar la respuesta a un formato común ----
    let eventosArray = [];
    let totalEventos = 0;

    if (tipoUsuario === 'Empresa') {
      eventosArray = json.eventos ?? [];
      totalEventos = json.total ?? eventosArray.length;
    } else {
      // Algunas APIs devuelven eventos.activos + resumen.totalEventos,
      // otras simplemente eventos + total. Tomamos el que exista.
      eventosArray = json.eventos?.activos ?? json.eventos ?? [];
      totalEventos = json.resumen?.totalEventos ?? json.total ?? eventosArray.length;
    }

    // ---- 3.4  Calcular total de páginas ----
    totalPag = Math.max(1, Math.ceil(totalEventos / limite));

    // ---- 3.5  Renderizar ----
    if (!append) feed.innerHTML = '';
    renderCards(eventosArray);
    pagina++;                      // ← para la próxima llamada
  } catch (err) {
    console.error(err);
    if (!append) {
      feed.innerHTML = '<p class="text-center text-red-300">Error al cargar tus eventos.</p>';
    }
  }

  loading = false;
}

// ================================================
// 4.  RENDER DE TARJETAS
// ================================================
function renderCards(arr) {
  if (!arr.length && pagina === 1) {
    feed.innerHTML = '<p class="text-center text-white/80">No hay eventos.</p>';
    return;
  }

  arr.forEach(ev => {
    // Imagen o placeholder
    const img = ev.imagenPrincipal?.url
      ? `<img src="${ev.imagenPrincipal.url}" class="h-48 w-full object-cover" />`
      : `<div class="h-48 w-full flex items-center justify-center bg-gray-200 text-gray-500">Sin imagen</div>`;

    // Badge de estado o tipoParticipacion (si es empresa)
    const badge = tipoUsuario === 'Empresa' && ev.tipoParticipacion
      ? `<span class="mt-auto text-xs bg-green-600 text-white px-2 py-0.5 rounded">${ev.tipoParticipacion}</span>`
      : `<span class="mt-auto text-xs bg-brand-cian text-white px-2 py-0.5 rounded">${ev.estado}</span>`;

    // Cuerpo de la tarjeta
    const body = `
      <div class="p-4 flex-1 flex flex-col">
        <h3 class="text-lg font-semibold mb-1 line-clamp-2">${ev.titulo}</h3>
        <p class="text-sm mb-1"><strong>Fecha:</strong> ${new Date(ev.fechaInicio).toLocaleDateString()}</p>
        ${badge}
      </div>
    `;

    // Tarjeta
    const card          = document.createElement('article');
    card.className      = 'bg-white/90 backdrop-blur-md rounded-2xl shadow hover:shadow-lg transition overflow-hidden flex flex-col cursor-pointer';
    card.innerHTML      = img + body;
    card.onclick        = () => window.location.href = `detalle-evento.html?eventoId=${ev._id}`;
    feed.appendChild(card);
  });
}

// ================================================
// 5.  INFINITE SCROLL
// ================================================
const obs = new IntersectionObserver(
  entries => { if (entries[0].isIntersecting) loadMyEvents(true); },
  { rootMargin: '0px 0px 400px 0px' }
);

obs.observe(sentinel);
