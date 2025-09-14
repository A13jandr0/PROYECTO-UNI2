// (coloca este archivo en /scripts/auth/)
document.getElementById('formEmpresa').addEventListener('submit', async (e) => {
  e.preventDefault();

  const msg = document.getElementById('msg');
  msg.textContent = 'Registrando…';
  msg.className   = 'text-sm text-brand-profundo';

  // Construir el payload
  const payload = {
    tipo_usuario:   'Empresa',
    nombre_usuario: e.target.nombre_usuario.value.trim(),
    correo:         e.target.correo.value.trim(),
    contrasena:     e.target.contrasena.value,
    nombre_empresa: e.target.nombre_empresa.value.trim(),
    razon_social:   e.target.razon_social.value.trim(),
    NIT:            e.target.NIT.value.trim(),
    telefono:       e.target.telefono.value.trim(),
    direccion:      e.target.direccion.value.trim(),
    sitio_web:      e.target.sitio_web.value.trim() || null,
    descripcion:    e.target.descripcion.value.trim() || null
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Error al registrar');
    }

    // Éxito → guarda token y redirige al dashboard (o login)
    localStorage.setItem('token',        data.token);
    localStorage.setItem('tipo_usuario', data.user.tipo_usuario);
    localStorage.setItem('sqlUserId',    data.user.sqlUserId);
    localStorage.setItem('nombre_usuario', data.user.nombre_usuario);

    msg.textContent = '¡Empresa registrada con éxito!';
    msg.className   = 'text-sm font-medium text-green-700';

    setTimeout(() => window.location.href = '../../index.html', 1200);

  } catch (err) {
    console.error(err);
    msg.textContent = err.message;
    msg.className   = 'text-sm font-medium text-red-600';
  }
});
