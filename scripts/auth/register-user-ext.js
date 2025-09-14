// scripts/auth/register.js
// Maneja el envío del formulario de registro para “Integrante externo”
// Requiere que config.js exponga la constante global API_BASE_URL

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formRegister');
  const msg  = document.getElementById('msg');

  // Función auxiliar: cambiar estado del botón
  const toggleButton = (disabled) => {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('cursor-not-allowed', disabled);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    toggleButton(true);

    // Construir el JSON exactamente como en tu ejemplo
    const body = {
      tipo_usuario:       'Integrante externo',
      nombre_usuario:     form.nombre_usuario.value.trim(),
      correo:             form.correo.value.trim(),
      contrasena:         form.contrasena.value,
      nombres:            form.nombres.value.trim(),
      apellidos:          form.apellidos.value.trim(),
      documento_identidad: form.documento_identidad.value.trim(),
      telefono:           form.telefono.value.trim(),
      direccion:          form.direccion.value.trim(),
      fecha_nacimiento:   form.fecha_nacimiento.value
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await res.json();

      if (res.ok && result.success) {
        msg.className = 'text-sm text-center text-green-600';
        msg.textContent = '¡Registro exitoso! Redirigiendo…';
        form.reset();
        setTimeout(() => {
          window.location.href = '../../index.html'; 
        }, 1000);
      } else {
        throw new Error(result.error || 'Error desconocido');
      }
    } catch (err) {
      msg.className = 'text-sm text-center text-red-600';
      msg.textContent = err.message;
    } finally {
      toggleButton(false);
    }
  });
});

document.getElementById("formRegister").addEventListener("submit", function (e) {
  const fechaNacimiento = document.getElementById("fecha_nacimiento").value;
  const fecha = new Date(fechaNacimiento);
  const hoy = new Date();
  const edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  const dia = hoy.getDate() - fecha.getDate();

  const esMenor =
    edad < 18 || (edad === 18 && (mes < 0 || (mes === 0 && dia < 0)));

  if (esMenor) {
    e.preventDefault(); // Cancelar envío
    document.getElementById("msg").textContent = "Debes tener al menos 18 años para registrarte.";
    document.getElementById("msg").classList.add("text-red-500");
  }
});
