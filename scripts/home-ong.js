import { createCard } from './events/components/card-event.js';

const token       = localStorage.getItem('token');
const tipoUsuario = localStorage.getItem('tipo_usuario');
const sqlUserId   = localStorage.getItem('sqlUserId');

if (!token || tipoUsuario !== 'ONG') {
  localStorage.clear();
  window.location.href = 'index.html';
  throw new Error('Acceso no permitido');
}

document.getElementById('orgName').textContent =
  localStorage.getItem('nombre_usuario') ?? '';
const actionsBox = document.getElementById('actions');

// Botones de navegación
[
  { txt: 'DHevento',        route: '../DEV/DachE.html' },
  { txt: 'DHmega-evento',   route: '../DME/DachME.html' },
  { txt: 'Crear evento',    route: '../pages/event/create-event.html' },
  { txt: 'Crear mega-evento', route: '../pages/event/create-mega-event.html' }
].forEach(({ txt, route }) => {
  const btn = document.createElement('button');
  btn.textContent = txt;
  btn.className =
    'px-4 py-2 rounded-xl text-white font-semibold shadow-md transition-all ' +
    'bg-gradient-to-r from-[#36C974] to-[#21BFC4] hover:from-[#3883D3] hover:to-[#21BFC4]';
  btn.onclick = () => (window.location.href = route);
  actionsBox.append(btn);
});

// Acción de logout
document.getElementById('logoutBtn').onclick = () => {
  localStorage.clear();
  window.location.href = '../../index.html';
};

// Elementos del DOM
const cont       = document.getElementById('eventsContainer');
const selTipo    = document.getElementById('filtroTipo');   // ← AGREGADO
const selEstado  = document.getElementById('filtroEstado');
const txtBuscar  = document.getElementById('filtroTexto');

// ───────────────────────────────────────────────
// FETCH de eventos simples
async function fetchEventos() {
  const res  = await fetch(`${API_BASE_URL}/api/events/ong/${sqlUserId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.eventos.map(e => ({ ...e, type: 'evento' }));
}

// FETCH de mega-eventos
async function fetchMegaEventos() {
  const res  = await fetch(`${API_BASE_URL}/api/mega-eventos/ong/${sqlUserId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.megaEventos.map(me => ({ ...me, type: 'mega' }));
}

// Unificar todos los eventos
async function fetchAllItems() {
  const [eventos, mega] = await Promise.all([fetchEventos(), fetchMegaEventos()]);
  return [...mega, ...eventos];
}

// ───────────────────────────────────────────────
// Renderizado
function render(items) {
  cont.innerHTML = '';

  const tipoF = selTipo.value;               // ← AGREGADO
  const estF  = selEstado.value.toLowerCase();
  const q     = txtBuscar.value.toLowerCase();

  const visibles = items.filter(it => {
    if (tipoF !== 'todos' && it.type !== tipoF) return false;         // ← AGREGADO
    if (estF !== 'todos' && it.estado.toLowerCase() !== estF) return false;
    if (q && !it.titulo.toLowerCase().includes(q)) return false;
    return true;
  });

  if (!visibles.length) {
    cont.innerHTML =
      '<p class="col-span-full text-center text-white/70">Sin resultados</p>';
    return;
  }

  visibles.forEach(it => {
    const card = createCard(it);

    if (it.type === 'mega') {
      card.classList.add('border-emerald-500');
    } else {
      card.classList.add('border-cyan-500');
    }

    card.onclick = () => {
      if (it.type === 'mega') {
        window.location.href = `../pages/event/mega/detalle-mega-evento.html?id=${it._id}`;
      } else {
        window.location.href = `../pages/event/detalle-evento.html?id=${it._id}`;
      }
    };

    cont.append(card);
  });
}

// ───────────────────────────────────────────────
// Inicialización y listeners
let allItems = [];

fetchAllItems()
  .then(data => {
    allItems = data;
    document.getElementById('titulo').textContent = 'Mis Eventos & Mega-Eventos';
    render(allItems);
  })
  .catch(err => {
    cont.innerHTML =
      `<p class="col-span-full text-red-300 text-center">${err.message}</p>`;
  });

[selTipo, selEstado, txtBuscar].forEach(el =>
  el.addEventListener(
    el.tagName === 'INPUT' ? 'input' : 'change',
    () => render(allItems)
  )
);
