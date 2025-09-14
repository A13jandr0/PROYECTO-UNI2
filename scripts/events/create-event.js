/* ──────────── Variables globales ──────────── */
const token       = localStorage.getItem('token');
const tipoUsuario = localStorage.getItem('tipo_usuario');
const sqlUserId   = parseInt(localStorage.getItem('sqlUserId'), 10);
const allFiles = [];

// Variable global para almacenar la ciudad detectada
let ciudadDetectada = '';

/* ──────────── 1) Cargar empresas disponibles ──────────── */
async function loadCompanies() {
  try {
    const res  = await fetch(`${API_BASE_URL}/api/events/empresas/disponibles`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Error');

    const patrocinadoresBox = document.getElementById('patrocinadoresBox');
    const auspiciadoresBox  = document.getElementById('auspiciadoresBox');

    const makeCard = (emp, tipo) => {
      const wrap  = document.createElement('label');
      wrap.className = 'company-card';
      const chk   = document.createElement('input');
      chk.type    = 'checkbox';
      chk.value   = emp.id;
      chk.name    = tipo; // "patro" | "auspi"
      const img   = document.createElement('img');
      img.src     = emp.avatar  || '../../assets/img/default-company.png';
      img.alt     = emp.nombre;
      img.className = 'h-10 w-10 object-cover rounded-full';
      const span  = document.createElement('span');
      span.textContent = emp.nombre;
      wrap.append(chk, img, span);
      return wrap;
    };

    data.empresas.forEach(emp => {
      patrocinadoresBox.appendChild(makeCard(emp, 'patro'));
      auspiciadoresBox.appendChild(makeCard(emp, 'auspi'));
    });
  } catch (err) {
    console.error(err);
    document.getElementById('result').textContent =
      'No se pudieron cargar las empresas.';
  }
}
document.addEventListener('DOMContentLoaded', loadCompanies);

/* ──────────── 2) Mapa Leaflet + geocoding ──────────── */
let map, clickMarker;
function initMap() {
  const defaultLatLng = [-16.5, -68.13];
  map = L.map('map').setView(defaultLatLng, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  map.on('click', async e => {
    const { lat, lng } = e.latlng;
    if (clickMarker) clickMarker.setLatLng(e.latlng);
    else {
      clickMarker = L.marker(e.latlng, { draggable: true }).addTo(map)
        .on('dragend', ev => updateCoords(ev.target.getLatLng()));
    }
    updateCoords({ lat, lng });
  });
}

function updateCoords({ lat, lng }) {
  document.getElementById('lat').value = lat;
  document.getElementById('lng').value = lng;
  fetchAddressAndFill(lat, lng);
}

async function fetchAddressAndFill(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const r   = await fetch(url, { headers:{ Accept:'application/json' } });
    const j   = await r.json();
    
    // Mostrar la dirección completa
    document.getElementById('locacion').value = j.display_name || '';
    
    // Extraer la ciudad de la respuesta
    if (j.address) {
      // Nominatim puede devolver la ciudad en varios campos, en orden de prioridad:
      ciudadDetectada = j.address.city || 
                       j.address.town || 
                       j.address.municipality || 
                       j.address.village || 
                       j.address.county ||
                       j.address.state ||
                       'No especificada';
      
      console.log('Ciudad detectada:', ciudadDetectada);
      console.log('Datos completos de dirección:', j.address);
      
      // Opcional: Mostrar la ciudad detectada en algún lugar de la UI
      const ciudadInfo = document.getElementById('ciudadInfo');
      if (ciudadInfo) {
        ciudadInfo.textContent = `Ciudad: ${ciudadDetectada}`;
      }
    }
  } catch (err) { 
    console.error('Error al obtener dirección:', err);
    ciudadDetectada = 'No especificada';
  }
}

document.addEventListener('DOMContentLoaded', initMap);

// 4) PREVIEWS de imágenes: acumulativo
const inputImgs = document.getElementById('imagenesPromocionales');
const previewContainer = document.getElementById('previewContainer');

inputImgs.addEventListener('change', () => {
  // Añade cada nuevo File al array
  for (const file of inputImgs.files) {
    // evitar duplicados por nombre+size opcionalmente:
    if (!allFiles.some(f => f.name === file.name && f.size === file.size)) {
      allFiles.push(file);
    }
  }
  renderPreviews();
});

function renderPreviews() {
  previewContainer.innerHTML = '';
  allFiles.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const wrapper = document.createElement('div');
    wrapper.className = 'relative w-24 h-24 border rounded overflow-hidden';
    wrapper.innerHTML = `
      <img src="${url}" alt="${file.name}" class="object-cover w-full h-full">
      <button data-idx="${idx}" 
              class="absolute top-0 right-0 bg-black/50 text-white text-xs px-1">
        ×
      </button>`;
    // botón para eliminar un preview si quieres
    wrapper.querySelector('button').onclick = e => {
      const i = Number(e.currentTarget.dataset.idx);
      allFiles.splice(i, 1);
      renderPreviews();
    };
    previewContainer.appendChild(wrapper);
  });
}

/* ──────────── 3) Envío del formulario ──────────── */
document.getElementById('createEventJsonForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (!token) return alert('Debes iniciar sesión.');
  if (tipoUsuario !== 'ONG' || isNaN(sqlUserId))
    return alert('Solo una ONG autenticada puede crear un evento.');

  /* —— leer campos —— */
  const titulo         = document.getElementById('titulo').value.trim();
  const descripcion    = document.getElementById('descripcion').value.trim();
  const fechaInicioRaw = document.getElementById('fechaInicio').value;
  const fechaFinalRaw  = document.getElementById('fechaFinal').value;
  const locacion       = document.getElementById('locacion').value.trim();
  const tipoEvento     = document.getElementById('tipoEvento').value.trim().toLowerCase();
  const capacidadRaw   = document.getElementById('capacidadMaxima').value;
  const inscAbierta    = document.getElementById('inscripcionAbierta').checked;
  const fechaLimRaw    = document.getElementById('fechaLimiteInscripcion').value;
  const estado         = document.getElementById('estado').value.trim();
  const lat            = parseFloat(document.getElementById('lat').value);
  const lng            = parseFloat(document.getElementById('lng').value);

  // 1) Validación de campos obligatorios
  if (!titulo || !fechaInicioRaw || !locacion || !tipoEvento)
    return msg('Faltan campos obligatorios.');

  // 2) Parsear fechas a objetos Date para comparar
  const ahora       = new Date();
  const fechaInicio = new Date(fechaInicioRaw);
  const fechaFinal  = fechaFinalRaw ? new Date(fechaFinalRaw) : null;
  const fechaLimite = fechaLimRaw   ? new Date(fechaLimRaw)    : null;

  // 3) Validar que fechaInicio no sea anterior a "ahora"
  if (fechaInicio < ahora) {
    return msg('La Fecha de Inicio no puede ser anterior al momento actual.');
  }

  // 4) Si se ingresó fechaFinal, verificar que sea posterior a fechaInicio
  if (fechaFinal) {
    if (fechaFinal < fechaInicio) {
      return msg('La Fecha de Finalización debe ser posterior a la Fecha de Inicio.');
    }
  }

  // 5) Si hay fecha límite de inscripción, validar:
  if (fechaLimite) {
    if (fechaLimite < ahora) {
      return msg('La Fecha Límite de Inscripción no puede ser anterior al momento actual.');
    }
    if (fechaLimite > fechaInicio) {
      return msg('La Fecha Límite de Inscripción debe ser igual o anterior a la Fecha de Inicio.');
    }
  }

  // 6) Validar coordenadas del mapa
  if (isNaN(lat) || isNaN(lng))
    return msg('Selecciona la ubicación en el mapa.');

  /* —— FormData —— */
  const patroIds = [...document.querySelectorAll('input[name="patro"]:checked')]
                    .map(c => parseInt(c.value));
  const auspiIds = [...document.querySelectorAll('input[name="auspi"]:checked')]
                    .map(c => parseInt(c.value));

  const fd = new FormData();
  fd.append('titulo', titulo);
  fd.append('descripcion', descripcion);
  fd.append('fechaInicio', fechaInicio.toISOString());
  if (fechaFinal) fd.append('fechaFinal', fechaFinal.toISOString());
  const invitadoIds = [...document.querySelectorAll('input[name="invitados"]:checked')]
                     .map(el => parseInt(el.value, 10));
  if (invitadoIds.length) {
    fd.append('invitados', JSON.stringify(invitadoIds));
  }
  
  // Enviar la locación como objeto JSON con dirección y ciudad
  const locacionObj = {
    direccion: locacion,
    ciudad: ciudadDetectada || 'No especificada',
    tipoLocacion: 'presencial'
  };
  fd.append('locacion', JSON.stringify(locacionObj));
  
  fd.append('tipoEvento', tipoEvento);
  fd.append('ongId', String(sqlUserId));
  if (capacidadRaw) fd.append('capacidadMaxima', String(parseInt(capacidadRaw,10)));
  fd.append('inscripcionAbierta', inscAbierta ? '1' : '0');
  if (fechaLimite) fd.append('fechaLimiteInscripcion', fechaLimite.toISOString());
  if (patroIds.length) fd.append('patrocinadores', JSON.stringify(patroIds));
  if (auspiIds.length) fd.append('auspiciadores', JSON.stringify(auspiIds));
  fd.append('estado', estado);
  fd.append('lat', String(lat));
  fd.append('lng', String(lng));

  allFiles.forEach(f => fd.append('imagenesPromocionales', f));

  try {
    const r = await fetch(`${API_BASE_URL}/api/events`, {
      method:'POST',
      headers:{ Authorization:`Bearer ${token}` },
      body: fd
    });
    const j = await r.json();
    if (j.success) {
      msg('Evento creado ✓','green');
      setTimeout(()=>location.href='../../pages/home-ong.html', 1200);
    } else {
      msg(j.error || 'Error al crear evento.');
    }
  } catch (err) {
    console.error(err);
    msg('Error de red');
  }

  // Función para mostrar mensajes en el div #result
  function msg(text, color = 'red') {
    const div = document.getElementById('result');
    div.style.color = color;
    div.textContent = text;
  }
});

/**
 * 1.5) Cargar invitados disponibles
 */
async function loadInvitados() {
  try {
    const res  = await fetch(`${API_BASE_URL}/api/events/invitados`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Error');

    const cont = document.getElementById('invitadosBox');
    cont.innerHTML = ''; // limpia el placeholder

    data.invitados.forEach(inv => {
      const wrap = document.createElement('label');
      wrap.className = 'company-card';
      wrap.innerHTML = `
      <input type="checkbox"
            name="invitados"
            value="${inv.invitadoID}"
            class="peer sr-only">

      <div class="relative flex flex-col items-center gap-2 p-4 border
                  rounded-lg cursor-pointer transition
                  peer-checked:border-2 peer-checked:border-brand-accent2
                  peer-checked:bg-brand-accent2/5">

        <!-- Check verde sobrepuesto -->
        <svg class="absolute -top-2 -right-2 w-6 h-6 p-1 bg-white rounded-full
                    text-brand-accent2 shadow opacity-0
                    peer-checked:opacity-100 transition"
            viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3"
                d="M5 13l4 4L19 7" />
        </svg>

        <img src="${inv.avatar || '../../assets/img/default-user.png'}"
            alt="${inv.nombres} ${inv.apellidos}"
            class="w-12 h-12 rounded-full object-cover shadow-sm">
        <span class="text-sm text-gray-700 text-center">
          ${inv.nombres} ${inv.apellidos}
        </span>
      </div>`;
      cont.appendChild(wrap);
    });
  } catch (err) {
    console.error('No se pudieron cargar los invitados:', err);
    document.getElementById('result').textContent = 'Error cargando invitados.';
  }
}

// Llamar justo después de loadCompanies()
document.addEventListener('DOMContentLoaded', () => {
  loadCompanies();
  loadInvitados();
});
