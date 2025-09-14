import { exportStatsToPDF } from '../../assets/js/exportPdf.js';
import { openInviteModal } from '../../assets/js/invite-modal.js';

(async () => {
  /* ------------------------------------------------------------------ Auth */
  
  const token       = localStorage.getItem('token');
  const tipoUsuario = localStorage.getItem('tipo_usuario');
  const sqlUserId   = Number(localStorage.getItem('sqlUserId'));

  if (!token) {
    window.location.href = '../../index.html';
    return;
  }

  /* --------------------------------------------------------------- EventoId */
  const qs       = new URLSearchParams(location.search);
  const eventoId = qs.get('eventoId') || qs.get('id');


  const cont = document.getElementById('detalleContainer');
  if (!eventoId) {
    cont.innerHTML = '<p class="text-center text-red-600">No se indicó un evento.</p>';
    return;
  }

  try {
    /* -------------------------------------------------------------- Request */
    const r  = await fetch(`${API_BASE_URL}/api/events/${eventoId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { success, evento: ev, error } = await r.json();
    if (!success) throw new Error(error || 'Error al cargar evento');

    /* ------------------------------------------------------------ Galería */
    cont.innerHTML = '';
    if (ev.imagenesPromocionales?.length) {
      cont.insertAdjacentHTML(
        'beforeend',
        '<h2 class="text-2xl font-bold mb-4 text-cyan-700">Galería</h2>'
      );

      const wrap = document.createElement('div');
      wrap.className = 'relative w-full h-64 mb-8 bg-gray-100 rounded-lg overflow-hidden shadow-lg';

      let idx = 0;
      const img = document.createElement('img');
      img.className = 'w-full h-full object-contain';
      wrap.append(img);

      const setImg = (i) => {
        const it = ev.imagenesPromocionales[i];
        img.src  = it.url;
        img.alt  = it.descripcion || it.nombre || 'Imagen del evento';
      };
      setImg(idx);

      // navegación
      if (ev.imagenesPromocionales.length > 1) {
        ['left', 'right'].forEach((pos, i) => {
          const btn = document.createElement('button');
          btn.innerHTML = i ? '▶' : '◀';
          btn.className = `absolute ${pos}-3 top-1/2 -translate-y-1/2 bg-white/70 hover:bg-white rounded-full w-8 h-8 grid place-content-center text-cyan-700 shadow transition-all`;
          btn.onclick = () => {
            const max = ev.imagenesPromocionales.length - 1;
            idx = Math.max(0, Math.min(max, idx + (i ? 1 : -1)));
            setImg(idx);
          };
          wrap.append(btn);
        });
      }

      cont.append(wrap);
    }

    /* ------------------------------------------------------- Datos básicos */
    cont.insertAdjacentHTML('beforeend', '<h2 class="text-2xl font-bold mb-4 text-cyan-700">Información del evento</h2>');
    
    const campos = [
      ['Título', ev.titulo],
      ['Descripción', ev.descripcion || '–'],
      ['Fecha inicio', ev.fechaInicio && new Date(ev.fechaInicio).toLocaleString()],
      ['Fecha final', ev.fechaFinal && new Date(ev.fechaFinal).toLocaleString()],
      ['Límite inscripción', ev.fechaLimiteInscripcion && new Date(ev.fechaLimiteInscripcion).toLocaleString()],
      ['Ubicación', ev.locacion?.direccion ?? '–'],
      ['Ciudad', ev.locacion?.ciudad ?? '–'],
      ['Tipo', ev.tipoEvento ?? '–'],
      ['Categoría', ev.categoria ?? '–'],
      ['Capacidad', ev.capacidadMaxima ?? 'Ilimitada'],
      ['Inscripción abierta', ev.inscripcionAbierta ? 'Sí' : 'No'],
      ['Estado', ev.estado],
      ['Público', ev.publico ? 'Sí' : 'No']
    ];

    const dl = document.createElement('div');
    dl.className = 'grid gap-4 sm:grid-cols-2 bg-gray-50 p-4 rounded-lg';
    campos.forEach(([lbl, val]) => {
      dl.insertAdjacentHTML(
        'beforeend',
        `<div>
           <dt class="font-medium text-cyan-700">${lbl}</dt>
           <dd class="text-gray-700">${val ?? '–'}</dd>
         </div>`
      );
    });
    cont.append(dl);

    /* ---------------------------------------- Helper para empresas (chips) */
    const renderEmpresas = (arr, titulo) => {
      if (!arr?.length) return;
      cont.insertAdjacentHTML(
        'beforeend',
        `<h3 class="text-xl font-semibold mt-8 mb-3 text-cyan-700">${titulo}</h3>`
      );

      const box = document.createElement('div');
      box.className = 'flex flex-wrap gap-3';
      arr.forEach((emp) => {
        box.insertAdjacentHTML(
          'beforeend',
          `<div class="flex items-center gap-2 bg-white shadow-md rounded-full pl-2 pr-3 py-1 hover:shadow-lg transition-all">
             <img src="${emp.avatar || '../../assets/img/default-company.png'}"
                  alt="${emp.nombre_empresa}" 
                  class="h-8 w-8 rounded-full object-cover ring-2 ring-cyan-500/20">
             <span class="text-sm font-medium">${emp.nombre_empresa}</span>
           </div>`
        );
      });
      cont.append(box);
    };

    const renderInvitados = (arr) => {
      if (!arr?.length) return;
      cont.insertAdjacentHTML(
        'beforeend',
        `<h3 class="text-xl font-semibold mt-8 mb-3 text-cyan-700">Invitados</h3>`
      );

      const grid = document.createElement('div');
      grid.className = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
      arr.forEach((inv) => {
        grid.insertAdjacentHTML(
          'beforeend',
          `<div class="flex items-center gap-3 bg-white p-3 rounded-lg shadow hover:shadow-lg transition-all">
             <img src="${inv.avatar || '../../assets/img/user-default.jpg'}"
                  alt="${inv.nombres} ${inv.apellidos}"
                  class="h-10 w-10 rounded-full object-cover ring-2 ring-cyan-500/20">
             <div>
               <p class="font-medium">${inv.nombres} ${inv.apellidos}</p>
               <p class="text-xs text-gray-500">${inv.tipo_participacion || 'Invitado'}</p>
             </div>
           </div>`
        );
      });
      cont.append(grid);
    };

    renderEmpresas(ev.empresasPatrocinadoras, 'Patrocinadores');
    renderEmpresas(ev.empresasAuspiciadoras, 'Auspiciadores');
    renderInvitados(ev.invitados);
    await loadCompanyBanners(
      [...(ev.empresasPatrocinadoras||[]), ...(ev.empresasAuspiciadoras||[])],
      token
    );
    
    /* 
    /* --------------------------------------------------- Botones de acción */
    const actions = document.getElementById('actions');
    if (tipoUsuario === 'ONG' && sqlUserId === ev.ongId) {
      const addBtn = (txt, classes, cb) => {
        const b = document.createElement('button');
        b.textContent = txt;
        b.className = classes + ' px-4 py-2 rounded-lg text-white text-sm shadow transition-all transform hover:scale-105';
        b.onclick = cb;
        actions.append(b);
      };

      addBtn('✎ Editar', 'bg-emerald-500 hover:bg-emerald-600',
        () => location.href = `edit-event.html?eventoId=${eventoId}`);

      addBtn('🗑 Eliminar', 'bg-rose-500 hover:bg-rose-600',
        async () => {
          if (!confirm('¿Eliminar este evento de forma permanente?')) return;
          try {
            const r = await fetch(`${API_BASE_URL}/api/events/${eventoId}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ ongId: sqlUserId })
            });
            const j = await r.json();
            if (!r.ok || !j.success) throw new Error(j.error || 'No eliminado');
            alert(j.message);
            location.href = '../../pages/home-ong.html';
          } catch (e) {
            alert(e.message);
          }
        });

      addBtn(
        '👤 Invitar',
        'bg-blue-500 hover:bg-blue-600',
        () => openInviteModal(
          eventoId,
          token,
          () => loadInvitadosEspeciales(eventoId, token)  // aquí pasas tu función
        )
      );

      addBtn('👥 Participantes', 'bg-cyan-500 hover:bg-cyan-600',
        () => location.href = `participantes-evento.html?eventoId=${eventoId}`);

      addBtn('🔗 QR Check-In', 'bg-indigo-500 hover:bg-indigo-600',
        () => {
          const checkInUrl = new URL('/pages/event/scan.html', window.location.origin);
          checkInUrl.searchParams.set('eventoId', eventoId);

          const modal = document.createElement('div');
          modal.innerHTML = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div class="bg-white p-6 rounded-lg text-center">
                <h2 class="mb-4 font-bold text-xl">Escanea para hacer Check-In</h2>
                <div id="qrCode"></div>
                <button id="closeQr" class="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cerrar</button>
              </div>
            </div>`;
          document.body.append(modal);

          new QRCode(modal.querySelector('#qrCode'), {
            text: checkInUrl.toString(),
            width: 200,
            height: 200
          });

          modal.querySelector('#closeQr').onclick = () => modal.remove();
        });

      addBtn('🌱 Impacto social', 'bg-amber-500 hover:bg-amber-600',
        () => location.href = `../../pages/event/impacto-social.html?tipoEntidad=evento&entidadId=${eventoId}`);
    }

    /* ---------------------------------------------------- Título dinámico */
    document.getElementById('pageTitle').textContent = ev.titulo;

    if (tipoUsuario === 'ONG' && sqlUserId === ev.ongId) {
      await loadInvitadosEspeciales(eventoId, token);
    }

    /* ---------------------------------------------------- Cargar Estadísticas */
    if (tipoUsuario === 'ONG' && sqlUserId === ev.ongId) {
      await cargarEstadisticas(eventoId, token, sqlUserId);
    }

  } catch (err) {
    console.error(err);
    cont.innerHTML = '<p class="text-center text-red-600">No se pudo cargar el detalle del evento.</p>';
  }
})();

/* ---------------------------------------------------------------- Función para cargar estadísticas */
/* ---------------------------------------------------------------- Función para cargar estadísticas */
async function cargarEstadisticas(eventoId, token, ongId) {
  const statsSection = document.getElementById('stats-container');
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/events/${eventoId}/estadisticas?ongId=${ongId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 403) return; // no autorizado
    const { estadisticas: e, success, error } = await res.json();
    if (!success) throw new Error(error);

    // Destructuramos con defaults
    const {
      kpisGenerales = {},
      participacion = {},
      capacidad = {},
      proyecciones = null,
      contenido = {},
      empresas = {},
      tiempo = {},
      recomendaciones = []
    } = e;

    // Asegurarnos de que sean objetos
    const tiposImagenes = contenido.tiposImagenes || {};
    const recoms = recomendaciones || [];

    statsSection.innerHTML = `
      <div class="bg-white/90 rounded-3xl shadow-xl p-6 md:p-8 space-y-6">
        <h2 class="text-2xl font-bold mb-4 text-cyan-700 flex items-center gap-2">
          <!-- icono -->
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0V9a2 2 0 012-2h2a2 2 0 012 2v10"/>
          </svg>
          Estadísticas del evento
        </h2>

        <button class="tab" onclick="location.href='guia-kpis.html'">
        <i class="fas fa-circle-question"></i> ¿Qué significan estas métricas?
      </button>

        <div class="mt-6 text-center">
        <button id="exportPdfBtn"
                class="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg shadow">
          📄 Exportar PDF
        </button>
      </div>  

        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <!-- Éxito -->
          <div class="stat-card rounded-xl p-4 shadow-lg">
            <h3 class="font-semibold text-lg mb-3 text-indigo-600">Éxito del evento</h3>
            <div class="flex items-center justify-center">
              <span class="text-4xl font-bold" style="color: ${kpisGenerales.scoreExito?.color || '#000'}">
                ${kpisGenerales.scoreExito?.puntuacion ?? '–'}%
              </span>
            </div>
            <p class="text-center mt-2 text-sm">${kpisGenerales.scoreExito?.nivel || '–'}</p>
          </div>

          <!-- Días -->
          <div class="stat-card rounded-xl p-4 shadow-lg">
            <h3 class="font-semibold text-lg mb-3 text-indigo-600">Fecha vs hoy</h3>
            <p class="text-center text-sm">
              ${kpisGenerales.esPasado
                ? `Hace ${kpisGenerales.diasDesdeEvento} días`
                : `${kpisGenerales.diasHastaEvento} días`}
            </p>
          </div>

          <!-- Participación -->
          <div class="stat-card rounded-xl p-4 shadow-lg">
            <h3 class="font-semibold text-lg mb-3 text-green-600">Participación</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span>Inscritos:</span><span class="font-bold">${participacion.totalInscritos ?? 0}</span></div>
              <div class="flex justify-between"><span>Asistentes:</span><span class="font-bold">${participacion.totalAsistentes ?? 0}</span></div>
              <div class="flex justify-between"><span>% Asistencia:</span><span class="font-bold">${participacion.porcentajeAsistencia ?? 0}%</span></div>
            </div>
          </div>

          <!-- Capacidad -->
          <div class="stat-card rounded-xl p-4 shadow-lg">
            <h3 class="font-semibold text-lg mb-3 text-yellow-600">Capacidad</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span>Máxima:</span><span class="font-bold">${capacidad.capacidadMaxima ?? '∞'}</span></div>
              <div class="flex justify-between"><span>% Uso:</span><span class="font-bold">${capacidad.porcentajeCapacidad ?? 0}%</span></div>
              <div class="flex justify-between"><span>Disponibles:</span><span class="font-bold">${capacidad.espaciosDisponibles ?? '∞'}</span></div>
            </div>
          </div>

          <!-- Proyecciones -->
          ${proyecciones ? `
            <div class="stat-card rounded-xl p-4 shadow-lg">
              <h3 class="font-semibold text-lg mb-3 text-pink-600">Proyecciones</h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span>Insc. proyectadas:</span><span class="font-bold">${proyecciones.inscripcionesProyectadas}</span></div>
                <div class="flex justify-between"><span>% Lleno:</span><span class="font-bold">${proyecciones.probabilidadLlenarCapacidad}%</span></div>
                <div class="flex justify-between"><span>Días para lleno:</span><span class="font-bold">${proyecciones.diasParaLlenar ?? '–'}</span></div>
              </div>
            </div>
          ` : ''}

          <!-- Contenido multimedia -->
          <div class="stat-card rounded-xl p-4 shadow-lg">
            <h3 class="font-semibold text-lg mb-3 text-blue-600">Contenido</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span>Total imágenes:</span><span class="font-bold">${contenido.totalImagenes ?? 0}</span></div>
              ${Object.entries(tiposImagenes).length
                ? Object.entries(tiposImagenes).map(([t, c]) => `
                    <div class="flex justify-between"><span>${t}:</span><span class="font-bold">${c}</span></div>
                  `).join('')
                : '<p class="text-xs text-gray-500">Sin categorías</p>'}
            </div>
          </div>

          <!-- Empresas -->
          <div class="stat-card rounded-xl p-4 shadow-lg">
            <h3 class="font-semibold text-lg mb-3 text-orange-600">Empresas</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span>Patrocinadoras:</span><span class="font-bold">${empresas.totalPatrocinadoras ?? 0}</span></div>
              <div class="flex justify-between"><span>Auspiciadoras:</span><span class="font-bold">${empresas.totalAuspiciadoras ?? 0}</span></div>
            </div>
          </div>

          <!-- Tiempo -->
          <div class="stat-card rounded-xl p-4 shadow-lg">
            <h3 class="font-semibold text-lg mb-3 text-gray-600">Tiempo & Cambios</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span>Desde creación:</span><span class="font-bold">${tiempo.diasDesdeCreacion ?? 0} días</span></div>
              <div class="flex justify-between"><span>Cambios estado:</span><span class="font-bold">${tiempo.historialCambios ?? 0}</span></div>
            </div>
          </div>
        </div>

        <!-- Recomendaciones -->
        ${recoms.length ? `
          <div class="mt-6">
            <h3 class="text-xl font-semibold text-red-600 mb-3">Recomendaciones</h3>
            <ul class="list-disc pl-5 text-sm space-y-2">
              ${recoms.map(r => `
                <li>
                  <span class="font-medium">${r.mensaje}</span><br>
                  <em>${r.accion}</em>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
    statsSection.classList.remove('hidden');
    // Después de statsSection.innerHTML = `…`
    statsSection.querySelector('#exportPdfBtn').onclick = () => exportStatsToPDF(eventoId);

    statsSection.classList.remove('hidden');

  } catch (err) {
    console.error('Error cargando estadísticas:', err);
  }
}


/* ------------------------------------------------ cargar INVITADOS ------------------------------------------- */
async function loadInvitadosEspeciales(eventoId, token) {
  const sec    = document.getElementById('inv-container');
  const listEl = document.getElementById('inv-list');
  const loadEl = document.getElementById('inv-loading');
  if (!sec || !listEl || !loadEl) return;

  // 1) Limpiar y mostrar loading
  listEl.innerHTML = '';
  loadEl.style.display = '';
  loadEl.textContent = 'Cargando…';
  sec.classList.remove('hidden');

  try {
    // 2) Fetch
    const res = await fetch(
      `${API_BASE_URL}/api/list/evento/${eventoId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const { success, invitados, error } = await res.json();
    if (!success) throw new Error(error);

    // 3) No hay invitados
    if (invitados.length === 0) {
      loadEl.textContent = 'No hay invitados especiales.';
      return;
    }

    // 4) Ocultar loading
    loadEl.style.display = 'none';

    // 5) Renderizar cada invitado con selector de estado
    const estados = ['enviada','confirmada','cancelada','rechazada'];
    invitados.forEach(inv => {
      const imgSrc = inv.foto_url || '../../assets/img/user-default.jpg';
      const tipoColors = {
        vip: 'bg-purple-100 text-purple-800',
        ponente: 'bg-blue-100 text-blue-800',
        facilitador: 'bg-green-100 text-green-800',
        conferencista: 'bg-indigo-100 text-indigo-800',
        panelista: 'bg-yellow-100 text-yellow-800',
        artista: 'bg-pink-100 text-pink-800'
      };
      const badgeColor = tipoColors[inv.tipo_invitado] || 'bg-gray-100 text-gray-800';
      const estadoIcons = { enviada:'✉️', confirmada:'✅', cancelada:'⛔', rechazada:'❌' };
      const estadoIcon  = estadoIcons[inv.estado_invitacion] || '•';

      const item = document.createElement('div');
      item.className = 'flex items-center gap-4 bg-white p-4 rounded-lg shadow hover:shadow-lg transition-all';

      item.innerHTML = `
        <div class="relative">
          <img src="${imgSrc}" alt="${inv.nombre_completo}"
               class="h-14 w-14 rounded-full object-cover ring-2 ring-cyan-500/20"
               onerror="this.src='../../assets/img/user-default.jpg'">
          ${inv.tipo_invitado==='vip'
            ? `<div class="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                 <span class="text-xs">⭐</span>
               </div>`
            : ''}
        </div>
        <div class="flex-1">
          <p class="font-medium text-gray-900">${inv.nombre_completo}</p>
          <p class="text-xs text-gray-500 flex items-center gap-2 mt-1">
            <span class="px-2 py-0.5 rounded-full ${badgeColor}">
              ${inv.tipo_invitado.charAt(0).toUpperCase() + inv.tipo_invitado.slice(1)}
            </span>
            <span class="ml-2 estado-label">${estadoIcon} ${inv.estado_invitacion}</span>
          </p>
        </div>
        <div>
          <select data-id="${inv.id_invitado}" class="status-select px-2 py-1 border rounded text-sm">
            ${estados.map(e => `
              <option value="${e}" ${e === inv.estado_invitacion ? 'selected' : ''}>
                ${e.charAt(0).toUpperCase() + e.slice(1)}
              </option>
            `).join('')}
          </select>
        </div>
      `;

      listEl.append(item);
    });

    // 6) Listener para cada select
    listEl.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async e => {
        const invitadoId  = e.target.dataset.id;
        const nuevoEstado = e.target.value;
        try {
          const resp = await fetch(
            `${API_BASE_URL}/api/list/evento/${eventoId}/invitado/${invitadoId}/estado`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ estado: nuevoEstado })
            }
          );
          const j = await resp.json();
          if (!j.success) throw new Error(j.error);

          // Actualizar etiqueta
          const icon = { enviada:'✉️', confirmada:'✅', cancelada:'⛔', rechazada:'❌' }[nuevoEstado] || '•';
          const label = e.target.closest('div').previousElementSibling.querySelector('.estado-label');
          label.textContent = `${icon} ${nuevoEstado}`;
        } catch (err) {
          alert('No se pudo cambiar el estado: ' + err.message);
          // revertimos al valor anterior
          sel.value = sel.getAttribute('value');
        }
      });
    });

    // 7) Resumen al final
    const resumen = {
      total:       invitados.length,
      vips:        invitados.filter(i => i.tipo_invitado==='vip').length,
      ponentes:    invitados.filter(i => ['ponente','conferencista'].includes(i.tipo_invitado)).length,
      confirmados: invitados.filter(i => i.estado_invitacion==='confirmada').length
    };
    listEl.insertAdjacentHTML('beforeend', `
      <div class="mt-4 p-4 bg-gray-50 rounded-lg">
        <h4 class="text-sm font-semibold text-gray-700 mb-2">Resumen</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div class="text-center">
            <p class="text-2xl font-bold">${resumen.total}</p><p>Total</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold">${resumen.vips}</p><p>VIPs</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold">${resumen.ponentes}</p><p>Ponentes</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold">${resumen.confirmados}</p><p>Confirmados</p>
          </div>
        </div>
      </div>
    `);

  } catch (err) {
    console.error(err);
    loadEl.textContent = 'Error cargando invitados.';
  }
}

async function loadCompanyBanners(empresas, token) {
  const sec  = document.getElementById('banner-container');
  const list = document.getElementById('banner-list');
  list.innerHTML = '';  // limpia

  for (const emp of empresas) {
    // usa el campo correcto:
    const companyId = emp.empresaID;
    if (!companyId || isNaN(Number(companyId))) continue;loadInvitadosEspeciales

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/users/company/${companyId}/banner`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) continue;

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);

      const img = document.createElement('img');
      img.src       = url;
      img.alt       = emp.nombre_empresa;
      img.className = 'h-32 object-contain rounded-lg shadow-md';

      list.append(img);
    } catch (err) {
      console.error('Error cargando banner de', emp, err);
    }
  }

  if (list.children.length > 0) {
    sec.classList.remove('hidden');
  }
}




/* ---------------------------------------------------------------- Volver */
document.getElementById('volverBtn').onclick = () => history.back();