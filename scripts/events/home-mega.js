/* ═════════════════════════════════════════════════════════════
   HOME MEGA-EVENTOS – scroll infinito
   ═════════════════════════════════════════════════════════════ */

/* ===== 0) Sesión y navbar ===== */
const tokenMega   = localStorage.getItem('token');
const nombreMega  = localStorage.getItem('nombre_usuario') || '';

if (!tokenMega) {
  // Si no hay sesión, volvemos al login
  window.location.href = '../index.html';
  throw new Error('Sin token de autenticación');
}

/* ===== 1) Referencias DOM ===== */
const megaFeed     = document.getElementById('megaFeed');
const megaSentinel = document.getElementById('megaSentinel');

/* ===== 2) Paginación ===== */
let paginaMega   = 1;
const limiteMega = 8;         // mega‐eventos por “tirada”
let totalPagMega = Infinity;
let loadingMega  = false;

/* ===== 3) Utilidades ===== */
function fechaMegaL(e) {
  return new Date(e).toLocaleDateString();
}

/* ===== 4) Fetch + render ===== */
async function loadMegaEvents(append = false) {
  if (loadingMega || paginaMega > totalPagMega) return;
  loadingMega = true;

  if (!append) {
    megaFeed.innerHTML = '<p class="text-center text-white/80">Cargando…</p>';
  }

  const params = new URLSearchParams({
    pagina: paginaMega,
    limite: limiteMega,
    estado: 'convocatoria'   // por defecto mostramos solo “convocatoria”
  });

  const endpointMega = `${API_BASE_URL}/api/events/all_megaEvents?${params}`;

  try {
    const res   = await fetch(endpointMega);
    const json  = await res.json();
    if (!json.success) throw new Error(json.error || 'Error');
    totalPagMega = json.paginacion.totalPaginas;

    if (!append) megaFeed.innerHTML = '';
    renderMegaCards(json.megaEventos);

    paginaMega++;
  } catch (err) {
    console.error(err);
    if (!append) {
      megaFeed.innerHTML = '<p class="text-center text-red-300">Error al cargar mega-eventos.</p>';
    }
  }
  loadingMega = false;
}

/* ===== 5) Dibujar tarjetas de mega-evento ===== */
function renderMegaCards(arr) {
  if (!arr.length && paginaMega === 1) {
    megaFeed.innerHTML = '<p class="text-center text-white/80">Sin mega-eventos para mostrar.</p>';
    return;
  }

  arr.forEach(ev => {
    const card = document.createElement('article');
    card.className = `
      bg-white/90 rounded-2xl shadow hover:shadow-lg transition
      overflow-hidden cursor-pointer flex flex-col
    `;

    // 5.1) Imagen principal (si existe)
    const imgHtml = ev.imagenPrincipal?.url
      ? `<img src="${ev.imagenPrincipal.url}" class="h-56 w-full object-cover">`
      : `<div class="h-56 w-full flex items-center justify-center bg-gray-200 text-gray-500">Sin imagen</div>`;

    // 5.2) Cuerpo de la tarjeta
    // Mostramos título, fecha de inicio y ubicación (ciudad si la hay)
    const bodyHtml = `
      <div class="p-4 flex-1 flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-brand-profundo text-lg font-semibold line-clamp-2">${ev.titulo}</h3>
          <span class="px-2 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
            Mega
          </span>
        </div>
        <p class="text-sm text-gray-700 mb-1">
          <strong>Inicio:</strong> ${fechaMegaL(ev.fechaInicio)} 
          ${new Date(ev.fechaInicio).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
        </p>
        ${ ev.ubicacion?.ciudad
            ? `<p class="text-sm text-gray-700 mb-2"><strong>Ciudad:</strong> ${ev.ubicacion.ciudad}</p>`
            : ''
        }
        <span class="mt-auto text-xs bg-indigo-500 text-white px-2 py-0.5 rounded">
          ${ev.categoria?.toUpperCase() || 'Sin categoría'}
        </span>
      </div>
    `;

    card.innerHTML = imgHtml + bodyHtml;

    // Al hacer clic, vamos al detalle de ese mega-evento
    card.addEventListener('click', () => {
      window.location.href = `../pages/mega-evento/detalle.html?megaId=${ev._id}`;
      // (debes crear tu página de detalle en `pages/mega-evento/detalle.html`)
    });

    megaFeed.appendChild(card);
  });
}

/* ===== 6) IntersectionObserver para scroll infinito ===== */
const obsMega = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    loadMegaEvents(true);
  }
}, { rootMargin: '0px 0px 400px 0px' });

obsMega.observe(megaSentinel);

/* ===== 7) Primera carga ===== */
document.addEventListener('DOMContentLoaded', () => {
  loadMegaEvents(false);
});
