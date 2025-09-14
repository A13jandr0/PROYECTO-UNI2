// /scripts/auth/register-ong.js

// 1) Inicializar el mapa al cargar la página
function initMap() {
  const defaultCenter = [-16.5, -68.13]; // Ajusta a tu ciudad
  const map = L.map('map').setView(defaultCenter, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  let marker;
  map.on('click', async (e) => {
    const { lat, lng } = e.latlng;
    if (marker) marker.setLatLng(e.latlng);
    else marker = L.marker(e.latlng, { draggable: true })
                 .addTo(map)
                 .on('dragend', ev => onMapClick(ev.target.getLatLng()));
    await onMapClick({ lat, lng });
  });
}

async function onMapClick({ lat, lng }) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, { headers:{ Accept:'application/json' } });
    const j   = await res.json();
    if (j.display_name) {
      document.getElementById('direccion').value = j.display_name;
    }
  } catch {
    console.warn('No se pudo obtener la dirección de OSM');
  }
}

// 2) Arranca todo cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  initMap();

  document.getElementById('formOng').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    msg.textContent = 'Registrando…';
    msg.className   = 'text-sm text-brand-profundo';

    const payload = {
      tipo_usuario  : 'ONG',
      nombre_usuario: e.target.nombre_usuario.value.trim(),
      correo        : e.target.correo.value.trim(),
      contrasena    : e.target.contrasena.value,
      nombre_ong    : e.target.nombre_ong.value.trim(),
      NIT           : e.target.NIT.value.trim(),
      telefono      : e.target.telefono.value.trim(),
      direccion     : e.target.direccion.value.trim(),  // ya poblado por el mapa
      sitio_web     : e.target.sitio_web.value.trim() || null,
      descripcion   : e.target.descripcion.value.trim() || null
    };

    try {
      const res  = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al registrar');
      
      localStorage.setItem('token',         data.token);
      localStorage.setItem('tipo_usuario',  data.user.tipo_usuario);
      localStorage.setItem('sqlUserId',     data.user.sqlUserId);
      localStorage.setItem('nombre_usuario',data.user.nombre_usuario);

      msg.textContent = '¡ONG registrada con éxito!';
      msg.className   = 'text-sm font-medium text-green-700';
      setTimeout(() => window.location.href = '../../index.html', 1200);

    } catch (err) {
      msg.textContent = err.message;
      msg.className   = 'text-sm font-medium text-red-600';
      console.error(err);
    }
  });
});
