// scripts/header.js

// 1) Proteger la ruta: si no hay token → volvemos al login
const token        = localStorage.getItem('token');
const tipo_usuario = localStorage.getItem('tipo_usuario');
const nombreUsuario = localStorage.getItem('nombre_usuario');

if (!token) {
  // Si no hay token, redirige siempre a la página de login/índice
  window.location.href = '../index.html';
  throw new Error('Sin token de autenticación');
}

// 2) Mostrar el nombre de usuario en el enlace de perfil
const userNameSpan = document.getElementById('userNameSpan');
if (userNameSpan) {
  userNameSpan.innerText = nombreUsuario || '';
}

// 3) Inyectar botones adicionales en función del rol
const actionsDiv = document.getElementById('actions');

// Si el usuario es ONG, mostramos “Crear nuevo evento”
if (tipo_usuario === 'ONG') {
  const btnCrearEvento = document.createElement('button');
  btnCrearEvento.innerText = 'Crear nuevo evento';
  btnCrearEvento.className = [
    'rounded-lg',
    'bg-brand-lima',
    'hover:bg-brand-cian',
    'text-white',
    'px-4',
    'py-1.5',
    'text-sm',
    'shadow-lg',
    'shadow-brand-lima/40'
  ].join(' ');
  btnCrearEvento.addEventListener('click', () => {
    window.location.href = '../pages/event/create-event.html';
  });
  actionsDiv.appendChild(btnCrearEvento);
}

// Si el usuario es Empresa, podrías inyectar un botón distinto (ejemplo: “Publicar servicio”)
// if (tipo_usuario === 'Empresa') {
//   const btnPublicar = document.createElement('button');
//   btnPublicar.innerText = 'Publicar servicio';
//   btnPublicar.className = 'rounded-lg bg-brand-cian hover:bg-brand-lima text-white px-4 py-1.5 text-sm shadow';
//   btnPublicar.addEventListener('click', () => {
//     window.location.href = '../pages/service/create-service.html';
//   });
//   actionsDiv.appendChild(btnPublicar);
// }

// Si el usuario es Integrante externo o Super admin, por ahora no inyectamos nada extra.
// Puedes agregar aquí más condiciones para otros roles:

// 4) Logout: vacía localStorage y regresa al login
const logoutBtn = document.getElementById('logoutBtn');
logoutBtn.addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '../index.html';
});
