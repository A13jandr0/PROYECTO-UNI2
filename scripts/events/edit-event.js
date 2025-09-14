/* ============================================================================
 *  scripts/events/edit-event.js
 *  Lógica de edición + Leaflet (adaptada al nuevo nombre de campo e inputs)
 * ========================================================================== */

/* ------------------------- Autenticación ----------------------------------- */
const token       = localStorage.getItem('token');
const tipoUsuario = localStorage.getItem('tipo_usuario');
const sqlUserId   = Number(localStorage.getItem('sqlUserId'));

// al principio de edit-event.js, justo debajo de “const sqlUserId…”
function showToast(mensaje, tipo = 'success') {
  const cont = document.getElementById('notificacion');
  const text = document.getElementById('noti-text');
  // cambiar color si quisieras distintos tipos:
  cont.querySelector('div').classList.toggle('bg-red-500', tipo==='error');
  cont.querySelector('div').classList.toggle('bg-green-500', tipo==='success');
  text.textContent = mensaje;
  cont.classList.add('opacity-100');
  setTimeout(() => cont.classList.remove('opacity-100'), 3000);
}


if (!token || tipoUsuario !== 'ONG') {
  location.href = '../../../index.html';
  throw new Error('No autorizado');
}

/* ------------------------- Inicialización ---------------------------------- */
let map, marker;
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadEventData();
  // listeners “volver / cancelar”
  document.getElementById('btnCancelar').onclick = () => history.back();
  document.getElementById('btnBack').onclick     = () => history.back();
  document.getElementById('formEditarEvento').addEventListener('submit', save);
});

/* ------------------------- Mapa -------------------------------------------- */
function initMap() {
  map = L.map('map').setView([-16.5, -68.13], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  map.on('click', ({ latlng }) => setPoint(latlng));
}

function setPoint({ lat, lng }) {
  if (marker) marker.setLatLng([lat, lng]);
  else marker = L.marker([lat, lng], { draggable: true })
                 .addTo(map)
                 .on('dragend', (e) => updateLatLng(e.target.getLatLng()));

  updateLatLng({ lat, lng });
}

function updateLatLng({ lat, lng }) {
  document.getElementById('lat').value = lat;
  document.getElementById('lng').value = lng;
  reverseGeocode(lat, lng);
}

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { Accept: 'application/json' } }
    );
    const j = await r.json();
    document.getElementById('direccion').value = j.display_name ?? '';
    if (j.address?.city)
      document.getElementById('ciudad').value = j.address.city;
  } catch {
    /* silencioso */
  }
}

/* ------------------------- Cargar datos ------------------------------------ */
async function loadEventData() {
  const eventoId = new URLSearchParams(location.search).get('eventoId');
  if (!eventoId) return history.back();

  try {
    const r = await fetch(`${API_BASE_URL}/api/events/${eventoId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { success, evento: ev, error } = await r.json();
    if (!success) throw new Error(error);

    if (sqlUserId !== ev.ongId) {
      alert('No autorizado');
      return history.back();
    }

    fillForm(ev);
  } catch (err) {
    console.error(err);
    alert('Error al cargar evento');
    history.back();
  }
}

function isoToLocal(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
}

async function loadCompanies(selectedPatro = [], selectedAuspi = []) {
  const res  = await fetch(`${API_BASE_URL}/api/events/empresas/disponibles`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const { empresas } = await res.json();

  const makeCard = (emp, tipo, selected) => {
    const wrap = document.createElement('label');
    wrap.className = 'company-card flex items-center gap-2 border p-2 rounded';
    const chk = document.createElement('input');
    chk.type  = 'checkbox';
    chk.value = emp.id;
    chk.name  = tipo;
    if (selected.includes(emp.id)) chk.checked = true;
    const img = document.createElement('img');
    img.src   = emp.avatar || '../../assets/img/default-company.png';
    img.alt   = emp.nombre;
    img.className = 'h-8 w-8 rounded-full object-cover';
    const span = document.createElement('span');
    span.textContent = emp.nombre;
    wrap.append(chk, img, span);
    return wrap;
  };

  const patroBox = document.getElementById('patrocinadoresBox');
  const auspiBox = document.getElementById('auspiciadoresBox');
  patroBox.innerHTML = '';
  auspiBox.innerHTML = '';

  empresas.forEach(emp => {
    patroBox.append(makeCard(emp, 'patrocinadores', selectedPatro));
    auspiBox.append(makeCard(emp, 'auspiciadores', selectedAuspi));
  });
}

function fillForm(ev) {
  const $ = (id) => document.getElementById(id);
  const prePatro = ev.empresasPatrocinadoras.map(e => e.empresaID);
  const preAuspi = ev.empresasAuspiciadoras .map(e => e.empresaID);
  loadCompanies(prePatro, preAuspi);
  $('titulo').value        = ev.titulo ?? '';
  $('descripcion').value   = ev.descripcion ?? '';
  $('fechaInicio').value   = isoToLocal(ev.fechaInicio);
  $('fechaFinal').value    = isoToLocal(ev.fechaFinal);
  $('fechaLimiteInscripcion').value = isoToLocal(ev.fechaLimiteInscripcion);
  $('direccion').value     = ev.locacion?.direccion ?? '';
  $('ciudad').value        = ev.locacion?.ciudad ?? '';
  $('tipoEvento').value    = ev.tipoEvento ?? 'otro';
  $('capacidadMaxima').value = ev.capacidadMaxima ?? '';
  $('inscripcionAbierta').checked = !!ev.inscripcionAbierta;
  $('estado').value        = ev.estado ?? 'borrador';

  // coords existentes
  if (ev.locacion?.lat && ev.locacion?.lng) {
    setPoint({ lat: ev.locacion.lat, lng: ev.locacion.lng });
    map.setView([ev.locacion.lat, ev.locacion.lng], 15);
  }
}

/* ------------------------- Guardar ----------------------------------------- */
async function save(e) {
  e.preventDefault();
  const eventoId = new URLSearchParams(location.search).get('eventoId');

  // Máx. 10 imágenes
  if (document.getElementById('imagenes').files.length > 10) {
    return alert('Máximo 10 imágenes');
  }

  const f = new FormData(e.target);

  // quitar el "on" que pone el navegador
  f.delete('inscripcionAbierta');



  f.delete('inscripcionAbierta');
  const checked = document.getElementById('inscripcionAbierta').checked;
  f.append('inscripcionAbierta', String(checked));
  f.append('ongId', sqlUserId);

  try {
    const r = await fetch(`${API_BASE_URL}/api/events/${eventoId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: f
    });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(j.error);
    showToast('🎉 Tu evento se actualizó correctamente.');
    // redirige un pelín después de mostrarlo
    setTimeout(() => {
      window.location.href = `detalle-evento.html?eventoId=${eventoId}`;
    }, 1200);
  } catch (err) {
    alert(`No se pudo actualizar: ${err.message}`);
  }
}
