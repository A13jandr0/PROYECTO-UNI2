// /scripts/events/impacto-social.js
const token = localStorage.getItem('token');
if (!token) location.href = '../../index.html';

document.addEventListener('DOMContentLoaded', async () => {
  const qs          = new URLSearchParams(location.search);
  const tipoEntidad = qs.get('tipoEntidad');   // "evento" | "mega_evento"
  const entidadId   = qs.get('entidadId');     // Mongo _id

  if (!tipoEntidad || !entidadId) {
    document.getElementById('stats').textContent =
      'Parámetros faltantes.';
    return;
  }

  try {
    /* ---- Likes -------------------------------------------------------- */
    const rLikes = await fetch(
      `${API_BASE_URL}/api/likes/${tipoEntidad}/${entidadId}/statistics`,
      { headers:{ Authorization:`Bearer ${token}` } }
    );
    const jLikes = await rLikes.json();
    if (!rLikes.ok || !jLikes.success) throw new Error(jLikes.error||'Error likes');
    renderLikes(jLikes.estadisticas);

    /* ---- Comentarios --------------------------------------------------- */
    const rComm = await fetch(
      `${API_BASE_URL}/api/comments/${tipoEntidad}/${entidadId}/statistics`,
      { headers:{ Authorization:`Bearer ${token}` } }
    );
    const jComm = await rComm.json();
    if (!rComm.ok || !jComm.success) throw new Error(jComm.error||'Error comentarios');
    renderComments(jComm.estadisticas);

  } catch (e) {
    console.error(e);
    document.getElementById('stats').textContent =
      'No se pudo cargar el impacto social.';
    document.getElementById('commentsStats').textContent = '';
  }
});

/* ---------- Likes ---------- */
function renderLikes(s) {
  const el = document.getElementById('stats');
  el.innerHTML = `
    <div class="text-center">
      <p class="text-4xl font-bold text-amber-600">${s.totalLikes}</p>
      <p class="text-sm text-gray-600">likes totales</p>
    </div>

    <h2 class="font-semibold">Likes por tipo de usuario</h2>
    <ul class="space-y-1">
      ${Object.entries(s.likesPorTipoUsuario)
               .map(([k,v])=>`<li><strong>${k}:</strong> ${v}</li>`).join('')}
    </ul>

    <h2 class="font-semibold mt-4">Últimos 7 días</h2>
    <ul class="grid grid-cols-2 gap-2 text-sm">
      ${s.likesUltimos7Dias.map(d=>`
        <li class="flex justify-between bg-gray-100 rounded px-2 py-1">
          <span>${new Date(d._id).toLocaleDateString()}</span>
          <span class="font-medium">${d.count}</span>
        </li>`).join('')}
    </ul>

    <p class="text-center mt-4 text-sm text-gray-600">
      Promedio diario: <strong>${s.promedioLikesPorDia.toFixed(1)}</strong>
    </p>
  `;
}

/* ---------- Comentarios ---------- */
function renderComments(c) {
  const el = document.getElementById('commentsStats');
  el.innerHTML = `
    <div class="text-center">
      <p class="text-4xl font-bold text-emerald-600">${c.totalComentarios}</p>
      <p class="text-sm text-gray-600">comentarios totales</p>
    </div>

    <h2 class="font-semibold">Sentimiento</h2>
    <ul class="space-y-1">
      ${Object.entries(c.sentimiento)
               .map(([k,v])=>`<li><strong>${k}:</strong> ${v}</li>`).join('')}
    </ul>

    <h2 class="font-semibold mt-4">Por categoría</h2>
    <ul class="space-y-1">
      ${Object.entries(c.categorias)
               .map(([k,v])=>`<li><strong>${k}:</strong> ${v}</li>`).join('')}
    </ul>

    <h2 class="font-semibold mt-4">Por tipo de usuario</h2>
    <ul class="space-y-1">
      ${Object.entries(c.tiposUsuario)
               .map(([k,v])=>`<li><strong>${k}:</strong> ${v}</li>`).join('')}
    </ul>
  `;
}
