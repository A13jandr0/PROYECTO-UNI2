async function cargarEmpresasEnSelect(selectId) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/mega-eventos/utils/empresas-disponibles`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { empresas } = await res.json();
  const sel = document.getElementById(selectId);
  empresas.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.empresaId;
    opt.textContent = e.nombre_empresa;
    sel.appendChild(opt);
  });
}



document.addEventListener('DOMContentLoaded', () => {
  const contenedor = document.getElementById('objetivosContainer');
  const btnAdd = document.getElementById('addObjetivoBtn');

  function crearInputObjetivo(value = '') {
    const wrapper = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'objetivos[]';
    input.required = true;
    input.placeholder = 'Describe un objetivo (mín. 10 caracteres)';
    input.value = value;
    wrapper.appendChild(input);

    // Botón para eliminar ese objetivo
    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.textContent = '🗑';
    btnDel.addEventListener('click', () => wrapper.remove());
    wrapper.appendChild(btnDel);

    contenedor.appendChild(wrapper);
  }
   crearInputObjetivo();

   btnAdd.addEventListener('click', () => crearInputObjetivo());

  const resultadosCont = document.getElementById('resultadosContainer');
  const btnAddRes    = document.getElementById('addResultadoBtn');

  function crearInputResultado(value = '') {
    const wr = document.createElement('div');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.name = 'resultadosEsperados[]';
    inp.required = true;
    inp.placeholder = 'Describe un resultado (mín. 5 caracteres)';
    inp.value = value;
    wr.appendChild(inp);
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '🗑';
    del.addEventListener('click', () => wr.remove());
    wr.appendChild(del);
    resultadosCont.appendChild(wr);
  }
  // Siempre arranca con uno:
  crearInputResultado();
  btnAddRes.addEventListener('click', () => crearInputResultado());

  

  // Poblar el select de estados
  const estadoSelect = document.getElementById('estadoSelect');
  Object.values(ESTADOS_MEGA_EVENTO).forEach(estado => {
    const opt = document.createElement('option');
    opt.value = estado;
    opt.textContent = estado;
    estadoSelect.appendChild(opt);
  });

  cargarEmpresasEnSelect('patrocinadoresSelect');
  cargarEmpresasEnSelect('auspiciadoresSelect');

  // Poblar el select de categorías
  const categorias = ['social','ambiental','educativo','salud','cultural','deportivo','tecnologico','otro'];
  const categoriaSelect = document.getElementById('categoriaSelect');
  categorias.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categoriaSelect.appendChild(opt);
  });


  const tagsSelect = document.getElementById('tagsSelect');
  TAGS_PERMITIDOS.forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = tag.replace('_', ' '); // opcional: mostrar con espacios
    tagsSelect.appendChild(opt);
  });

  // Función para parsear arrays de texto
  const parseArray = str => {
    if (!str || str.trim() === '') return [];
    return str.split(',').map(s => s.trim()).filter(s => s);
  };

  // Manejar envío del formulario
  const form = document.getElementById('createMegaForm');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    
    try {
      const fd = new FormData();

      // Campos simples
      fd.append('titulo', form.titulo.value);
      fd.append('descripcion', form.descripcion.value);
      fd.append('fechaInicio', new Date(form.fechaInicio.value).toISOString());
      fd.append('fechaFin', new Date(form.fechaFin.value).toISOString());
      fd.append('ubicacion', form.ubicacion.value);
      fd.append('categoria', form.categoria.value);
      const ongId = localStorage.getItem('sqlUserId');
      if (!ongId) throw new Error('No se encontró ONG en sesión. Por favor inicia sesión de nuevo.');
      fd.append('ongOrganizadoraPrincipal', ongId);
      
      // Validar y agregar capacidad máxima
      if (form.capacidadMaxima.value) {
        const capacidad = parseInt(form.capacidadMaxima.value);
        if (capacidad < 50) {
          throw new Error('La capacidad máxima debe ser mínimo 50');
        }
        fd.append('capacidadMaxima', capacidad);
      }

        if (form.fechaLimiteInscripcion.value) {
          // Convertimos a ISO, opcionalmente:
          const fl = new Date(form.fechaLimiteInscripcion.value).toISOString();
          fd.append('fechaLimiteInscripcion', fl);
        }

      // IMPORTANTE: Enviar arrays elemento por elemento, NO usar JSON.stringify
      
      // Patrocinadores
      const selected = Array.from(
        document.getElementById('patrocinadoresSelect').selectedOptions
      ).map(opt => opt.value);
      selected.forEach(id => fd.append('patrocinadores[]', id));
      
      // Auspiciadores
      Array.from(
        document.getElementById('auspiciadoresSelect').selectedOptions
      ).map(opt => opt.value)
      .forEach(id => fd.append('auspiciadores[]', id));

      
      const tagsSeleccionados = Array.from(tagsSelect.selectedOptions).map(o => o.value);
      if (tagsSeleccionados.length === 0) {
        throw new Error('Debe seleccionar al menos un tag');
      }
      tagsSeleccionados.forEach(tag => {
        fd.append('tags[]', tag);
      });
      
      // 👇 Objetivos desde los inputs dinámicos:
      const objetivosInputs = Array.from(
        document.getElementsByName('objetivos[]')
      ).map(i => i.value.trim())
      .filter(v => v);
      if (objetivosInputs.length === 0) {
        throw new Error('Debes agregar al menos un objetivo.');
      }
      const invalidObj = objetivosInputs.filter(o => o.length < 10);
      if (invalidObj.length) {
        throw new Error(
          `Objetivos inválidos (mín. 10 caracteres): ${invalidObj.join('; ')}`
        );
      }
      objetivosInputs.forEach(o => fd.append('objetivos[]', o));
      
      // … objetivos …

      // 👇 Resultados Esperados desde los inputs dinámicos:
      const resultadosInputs = Array.from(
        document.getElementsByName('resultadosEsperados[]')
      ).map(i => i.value.trim())
      .filter(v => v);
      if (resultadosInputs.length === 0) {
        throw new Error('Debes agregar al menos un resultado esperado.');
      }
      const invalidRes = resultadosInputs.filter(r => r.length < 5);
      if (invalidRes.length) {
        throw new Error(
          `Resultados inválidos (mín. 5 caracteres): ${invalidRes.join('; ')}`
        );
      }
      resultadosInputs.forEach(r => fd.append('resultadosEsperados[]', r));



      // Booleans
      fd.append('requiereAprobacion', form.requiereAprobacion.checked);
      fd.append('certificacionDisponible', form.certificacionDisponible.checked);
      fd.append('esPublico', form.esPublico.checked);

      // ContactoInfo - enviar campos individuales
      if (form['contactoInfo[email]'].value) {
        fd.append('contactoInfo[email]', form['contactoInfo[email]'].value);
      }
      if (form['contactoInfo[telefono]'].value) {
        fd.append('contactoInfo[telefono]', form['contactoInfo[telefono]'].value);
      }
      if (form['contactoInfo[nombre]'].value) {
        fd.append('contactoInfo[nombre]', form['contactoInfo[nombre]'].value);
      }

      // Estado
      fd.append('estado', form.estado.value);

      // Imágenes
      if (form.imagenes.files.length > 0) {
        Array.from(form.imagenes.files).forEach(file => {
          fd.append('imagenes', file);
        });
      }

      // Obtener token
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No hay token de autenticación. Por favor inicia sesión.');
      }

      // Enviar request
      const res = await fetch(`${API_BASE_URL}/api/mega-eventos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: fd
      });
      
      const data = await res.json();
      
      // Mostrar resultado
      const output = document.getElementById('output');
      if (res.ok && data.success) {
        output.style.color = 'green';
        output.textContent = '✅ ' + JSON.stringify(data, null, 2);
        // Opcional: limpiar el formulario
        form.reset();
      } else {
        output.style.color = 'red';
        output.textContent = '❌ ' + JSON.stringify(data, null, 2);
      }
      
    } catch (err) {
      const output = document.getElementById('output');
      output.style.color = 'red';
      output.textContent = '❌ Error: ' + err.message;
    }
  });
});