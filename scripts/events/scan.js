const token = localStorage.getItem('token');
if (!token) {
  alert('Necesitas iniciar sesión primero.');
  window.location.href = '../../index.html';
}

const qs = new URLSearchParams(location.search);
const eventoId = qs.get('eventoId');
if (!eventoId) {
  document.getElementById('checkInForm').innerHTML =
    '<p class="text-center text-red-600">Evento inválido.</p>';
}

document.getElementById('checkInForm')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const msgEl = document.getElementById('msg');
    msgEl.textContent = 'Enviando…';

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/events/${eventoId}/scan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ email })
        }
      );
      const json = await res.json();

      if (res.status === 409) {
        // Ya registraste tu asistencia: mensaje + redirección
        msgEl.textContent = 'ℹ️ Ya estás participando en este evento.';
        setTimeout(() => {
          window.location.href = '../../index.html';
        }, 2000);
        return;
      }

      if (!res.ok) {
        throw new Error(json.error || 'Error en el servidor');
      }

      // Éxito
      msgEl.textContent = '✅ ¡Asistencia registrada!';
      setTimeout(() => {
        window.location.href = '../../pages/home-publico.html';
      }, 1000);

    } catch (err) {
      msgEl.textContent = '❌ ' + err.message;
      // opcional: tras un error crítico, podrías también redirigir:
      // setTimeout(() => window.location.href = '../../index.html', 2000);
    }
  });
