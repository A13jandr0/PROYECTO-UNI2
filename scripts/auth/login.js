// login.js

// Mostrar/ocultar contraseña
document.getElementById('togglePassword').addEventListener('click', () => {
  const input = document.getElementById('password');
  input.type = input.type === 'password' ? 'text' : 'password';
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  // 1) Leer valores del formulario
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    // 2) Llamar al endpoint de login
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    // 3) Si el login fue exitoso, guardamos en localStorage:
    if (response.ok && data.success) {
      localStorage.setItem('token',         data.token);
      localStorage.setItem('tipo_usuario',  data.user.tipo_usuario);
      localStorage.setItem('sqlUserId',     data.user.sqlUserId ?? '');
      // ←––––– Aquí guardamos también el nombre de usuario / ONG
      localStorage.setItem('nombre_usuario', data.user.nombre_usuario);
      localStorage.setItem('sqlUserId',     data.user.sqlUserId ?? '');
      localStorage.setItem('id_usuario',    data.user.sqlUserId ?? '');

      /* 👇 NUEVO: decidir a dónde ir */
      const ruta = (data.user.tipo_usuario === 'ONG')
                    ? '../../pages/home-ong.html'
                    : '../../pages/home-publico.html';

      window.location.href = ruta;
      return;
    } else {
      // Mostrar mensaje de error dentro de <div id="result">
      document.getElementById('result').textContent = `Error: ${data.error || 'Credenciales inválidas'}`;
    }

  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    document.getElementById('result').textContent = 'Error de conexión con el servidor.';
  }
});
