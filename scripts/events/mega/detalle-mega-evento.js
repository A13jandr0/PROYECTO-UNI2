// tokens y tipo de usuario (puede ser 'ONG', 'Integrante externo' u otro)
const token       = localStorage.getItem('token');
const tipoUsuario = localStorage.getItem('tipo_usuario') || '';
const sqlUserId   = Number(localStorage.getItem('sqlUserId'));

const params = new URLSearchParams(window.location.search);
const id     = params.get('id');

let megaEventoActual = null;

// Color palette
const colors = {
  primary: '#3883D3',      // Primary blue
  secondary: '#21BFC4',    // Cyan/teal
  success: '#36C974',      // Green
  light: '#F9F9F9',        // Light gray
  dark: '#1a1a1a',         // Dark
  overlay: 'rgba(56, 131, 211, 0.15)' // Primary with transparency
};

if (!id) {
  const errEl = document.getElementById('error');
  errEl.textContent = 'ID de mega evento no especificado';
  errEl.classList.remove('hidden');
  throw new Error('Falta parámetro id');
}

// overlay para modales
const overlay = document.getElementById('modal-overlay');
function closeModal() {
  overlay.innerHTML = '';
  overlay.style.display = 'none';
}

// —————— MODAL ABSORBER EVENTOS ——————
async function openAbsorbModal() {
  if (tipoUsuario !== 'ONG') return;
  const res  = await fetch(`${API_BASE_URL}/api/mega-eventos/eventos-disponibles/listar`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  if (!json.success) return alert(json.error);
  buildAbsorbModal(json.eventos);
}

function buildAbsorbModal(eventos) {
  overlay.innerHTML = '';
  overlay.style.cssText = `
    position: fixed; 
    inset: 0; 
    background: linear-gradient(135deg, ${colors.overlay}, rgba(33, 191, 196, 0.1));
    backdrop-filter: blur(8px);
    display: flex; 
    align-items: center; 
    justify-content: center; 
    z-index: 1000;
  `;
  
  const box = document.createElement('div');
  box.className = 'modal-container';
  box.style.cssText = `
    background: ${colors.light};
    border-radius: 20px;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    width: 90%;
    max-width: 600px;
    padding: 32px;
    max-height: 80vh;
    overflow: auto;
    color: ${colors.dark};
    border: 2px solid ${colors.secondary};
  `;
  
  box.innerHTML = `
    <div class="modal-header" style="margin-bottom: 24px;">
      <h3 style="
        color: ${colors.primary};
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <span style="
          background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        ">📥</span>
        Absorber eventos (${eventos.length})
      </h3>
    </div>
    
    <div id="absorbError" style="
      color: #e53e3e;
      background: #fed7d7;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      display: none;
      border-left: 4px solid #e53e3e;
    "></div>
    
    <form id="formAbsorb">
      <div style="max-height: 300px; overflow-y: auto; margin-bottom: 24px;">
        ${eventos.map(ev => `
          <label style="
            display: block;
            margin-bottom: 12px;
            padding: 16px;
            background: linear-gradient(135deg, ${colors.light}, #fff);
            border-radius: 12px;
            border: 2px solid transparent;
            cursor: pointer;
            transition: all 0.3s ease;
          " onmouseover="this.style.borderColor='${colors.secondary}';" onmouseout="this.style.borderColor='transparent';">
            <input type="checkbox" name="eventId" value="${ev._id}" style="
              margin-right: 12px;
              transform: scale(1.2);
              accent-color: ${colors.success};
            " />
            <span style="
              font-weight: 600;
              color: ${colors.dark};
            ">${ev.titulo}</span>
            <span style="
              color: ${colors.primary};
              font-size: 0.9rem;
              margin-left: 8px;
            "> — ${new Date(ev.fechaInicio).toLocaleDateString()}</span>
          </label>
        `).join('')}
      </div>
      
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <button type="button" id="btnCloseAbsorb" style="
          padding: 12px 24px;
          background: #e2e8f0;
          color: ${colors.dark};
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        " onmouseover="this.style.background='#cbd5e0';" onmouseout="this.style.background='#e2e8f0';">
          Cerrar
        </button>
        <button type="submit" style="
          padding: 12px 24px;
          background: linear-gradient(135deg, ${colors.success}, #2f855a);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(54, 201, 116, 0.3);
        " onmouseover="this.style.transform='translateY(-2px)';" onmouseout="this.style.transform='translateY(0)';">
          Absorber Eventos
        </button>
      </div>
    </form>
  `;
  
  overlay.appendChild(box);
  overlay.style.display = 'flex';

  box.querySelector('#btnCloseAbsorb').onclick = closeModal;
  box.querySelector('#formAbsorb').onsubmit = async e => {
    e.preventDefault();
    const errDiv = box.querySelector('#absorbError');
    errDiv.style.display = 'none';
    errDiv.textContent = '';
    
    const ids = Array.from(box.querySelectorAll('input[name="eventId"]:checked'))
                     .map(cb => cb.value);
    if (!ids.length) {
      errDiv.textContent = 'Selecciona al menos un evento.';
      errDiv.style.display = 'block';
      return;
    }
    
    const res  = await fetch(`${API_BASE_URL}/api/mega-eventos/${id}/absorber-eventos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ eventosIds: ids, ongId: sqlUserId })
    });
    const json = await res.json();
    if (!json.success) {
      errDiv.textContent = json.error;
      errDiv.style.display = 'block';
      return;
    }
    alert(json.message);
    closeModal();
    fetchMega();
  };
}

// —————— MODAL LIBERAR EVENTOS ——————
async function openReleaseModal() {
  if (tipoUsuario !== 'ONG') return;
  const res  = await fetch(`${API_BASE_URL}/api/mega-eventos/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  if (!json.success) return alert(json.error);
  buildReleaseModal(json.megaEvento.eventosAbsorbidos);
}

function buildReleaseModal(eventos) {
  overlay.innerHTML = '';
  overlay.style.cssText = `
    position: fixed; 
    inset: 0; 
    background: linear-gradient(135deg, rgba(224, 56, 56, 0.15), ${colors.overlay});
    backdrop-filter: blur(8px);
    display: flex; 
    align-items: center; 
    justify-content: center; 
    z-index: 1000;
  `;
  
  const box = document.createElement('div');
  box.style.cssText = `
    background: ${colors.light};
    border-radius: 20px;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    width: 90%;
    max-width: 600px;
    padding: 32px;
    max-height: 80vh;
    overflow: auto;
    color: ${colors.dark};
    border: 2px solid #e53e3e;
  `;
  
  box.innerHTML = `
    <div class="modal-header" style="margin-bottom: 24px;">
      <h3 style="
        color: #e53e3e;
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <span style="
          background: linear-gradient(135deg, #e53e3e, #c53030);
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        ">📤</span>
        Liberar eventos (${eventos.length})
      </h3>
    </div>
    
    <div id="releaseError" style="
      color: #e53e3e;
      background: #fed7d7;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      display: none;
      border-left: 4px solid #e53e3e;
    "></div>
    
    <form id="formRelease">
      <div style="max-height: 300px; overflow-y: auto; margin-bottom: 24px;">
        ${eventos.map(ev => `
          <label style="
            display: block;
            margin-bottom: 12px;
            padding: 16px;
            background: linear-gradient(135deg, ${colors.light}, #fff);
            border-radius: 12px;
            border: 2px solid transparent;
            cursor: pointer;
            transition: all 0.3s ease;
          " onmouseover="this.style.borderColor='#e53e3e';" onmouseout="this.style.borderColor='transparent';">
            <input type="checkbox" name="eventId" value="${ev._id}" style="
              margin-right: 12px;
              transform: scale(1.2);
              accent-color: #e53e3e;
            " />
            <span style="
              font-weight: 600;
              color: ${colors.dark};
            ">${ev.titulo}</span>
            <span style="
              color: #e53e3e;
              font-size: 0.9rem;
              margin-left: 8px;
            "> — ${new Date(ev.fechaInicio).toLocaleDateString()}</span>
          </label>
        `).join('')}
      </div>
      
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <button type="button" id="btnCloseRelease" style="
          padding: 12px 24px;
          background: #e2e8f0;
          color: ${colors.dark};
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        ">Cerrar</button>
        <button type="submit" style="
          padding: 12px 24px;
          background: linear-gradient(135deg, #e53e3e, #c53030);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(229, 62, 62, 0.3);
        ">Liberar Eventos</button>
      </div>
    </form>
  `;
  
  overlay.appendChild(box);
  overlay.style.display = 'flex';

  box.querySelector('#btnCloseRelease').onclick = closeModal;
  box.querySelector('#formRelease').onsubmit = async e => {
    e.preventDefault();
    const errDiv = box.querySelector('#releaseError');
    errDiv.style.display = 'none';
    errDiv.textContent = '';
    
    const ids = Array.from(box.querySelectorAll('input[name="eventId"]:checked'))
                     .map(cb => cb.value);
    if (!ids.length) {
      errDiv.textContent = 'Selecciona al menos un evento.';
      errDiv.style.display = 'block';
      return;
    }
    
    const res  = await fetch(`${API_BASE_URL}/api/mega-eventos/${id}/liberar-eventos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ eventosIds: ids, ongId: sqlUserId })
    });
    const json = await res.json();
    if (!json.success) {
      errDiv.textContent = json.error;
      errDiv.style.display = 'block';
      return;
    }
    alert(json.message);
    closeModal();
    fetchMega();
  };
}

// —————— MODAL CAMBIAR ESTADO ——————
async function openChangeStateModal() {
  if (tipoUsuario !== 'ONG') return;
  const estadosValidos = [
    { value: 'planificacion', label: 'Planificación' },
    { value: 'convocatoria',  label: 'Convocatoria'   },
    { value: 'organizacion',  label: 'Organización'   },
    { value: 'en_curso',      label: 'En curso'       },
    { value: 'finalizado',    label: 'Finalizado'     },
    { value: 'cancelado',     label: 'Cancelado'      },
  ];
  buildChangeStateModal(estadosValidos, megaEventoActual.estado);
}

function buildChangeStateModal(estados, currentEstado) {
  overlay.innerHTML = '';
  overlay.style.cssText = `
    position: fixed; 
    inset: 0; 
    background: ${colors.overlay};
    backdrop-filter: blur(8px);
    display: flex; 
    align-items: center; 
    justify-content: center; 
    z-index: 1000;
  `;
  
  const box = document.createElement('div');
  box.style.cssText = `
    background: ${colors.light};
    border-radius: 20px;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    width: 90%;
    max-width: 500px;
    padding: 32px;
    max-height: 80vh;
    overflow: auto;
    color: ${colors.dark};
    border: 2px solid ${colors.primary};
  `;
  
  box.innerHTML = `
    <div class="modal-header" style="margin-bottom: 24px;">
      <h3 style="
        color: ${colors.primary};
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <span style="
          background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        ">⚙️</span>
        Cambiar Estado
      </h3>
    </div>
    
    <div id="changeError" style="
      color: #e53e3e;
      background: #fed7d7;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      display: none;
      border-left: 4px solid #e53e3e;
    "></div>
    
    <form id="formChangeState">
      <div style="margin-bottom: 20px;">
        <label style="
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          color: ${colors.dark};
        ">Nuevo estado:</label>
        <select id="selEstadoNuevo" style="
          width: 100%;
          padding: 12px;
          border: 2px solid ${colors.secondary};
          border-radius: 10px;
          background: white;
          color: ${colors.dark};
          font-size: 1rem;
          transition: all 0.3s ease;
        ">
          ${estados.map(e => `
            <option value="${e.value}" ${e.value === currentEstado ? 'selected' : ''}>
              ${e.label}
            </option>
          `).join('')}
        </select>
      </div>
      
      <div style="margin-bottom: 24px;">
        <label style="
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          color: ${colors.dark};
        ">Motivo (opcional):</label>
        <textarea id="txtMotivo" rows="3" style="
          width: 100%;
          padding: 12px;
          border: 2px solid ${colors.secondary};
          border-radius: 10px;
          background: white;
          color: ${colors.dark};
          font-size: 1rem;
          resize: vertical;
          transition: all 0.3s ease;
        "></textarea>
      </div>
      
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <button type="button" id="btnCloseChange" style="
          padding: 12px 24px;
          background: #e2e8f0;
          color: ${colors.dark};
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        ">Cerrar</button>
        <button type="submit" style="
          padding: 12px 24px;
          background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(56, 131, 211, 0.3);
        ">Guardar Cambios</button>
      </div>
    </form>
  `;
  
  overlay.appendChild(box);
  overlay.style.display = 'flex';

  box.querySelector('#btnCloseChange').onclick = closeModal;
  box.querySelector('#formChangeState').onsubmit = async e => {
    e.preventDefault();
    const errDiv      = box.querySelector('#changeError');
    const nuevoEstado = box.querySelector('#selEstadoNuevo').value;
    const motivo      = box.querySelector('#txtMotivo').value.trim() || 'Sin motivo';
    errDiv.style.display = 'none';
    errDiv.textContent = '';

    try {
      const res  = await fetch(
        `${API_BASE_URL}/api/mega-eventos/${id}/estado`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            nuevoEstado,
            ongId: sqlUserId,
            motivo
          })
        }
      );
      const json = await res.json();
      if (!json.success) {
        errDiv.textContent = json.error || 'Error al guardar';
        errDiv.style.display = 'block';
        return;
      }
      alert(json.message);
      closeModal();
      fetchMega();
    } catch (err) {
      errDiv.textContent = err.message;
      errDiv.style.display = 'block';
    }
  };
}

function buildEventCard(ev) {
  const inicio = new Date(ev.fechaInicio).toLocaleDateString();
  const fin    = ev.fechaFin ? new Date(ev.fechaFin).toLocaleDateString() : '';

  return `
    <article style="
      background: linear-gradient(135deg, ${colors.light}, #fff);
      border-radius: 16px;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
      padding: 24px;
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
      border: 2px solid transparent;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    " onmouseover="this.style.borderColor='${colors.secondary}'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 30px rgba(0, 0, 0, 0.12)';" onmouseout="this.style.borderColor='transparent'; this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 25px rgba(0, 0, 0, 0.08)';">
      
      <!-- Decorative gradient bar -->
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, ${colors.primary}, ${colors.secondary}, ${colors.success});
      "></div>
      
      <!-- Imagen principal -->
      ${ev.imagenPrincipal
          ? `<img src="${ev.imagenPrincipal.url}" alt="Imagen ${ev.titulo}" style="
               width: 120px;
               height: 120px;
               object-fit: cover;
               border-radius: 12px;
               flex-shrink: 0;
               border: 3px solid ${colors.secondary};
             " />`
          : `<div style="
               width: 120px;
               height: 120px;
               background: linear-gradient(135deg, ${colors.overlay}, rgba(33, 191, 196, 0.1));
               border-radius: 12px;
               flex-shrink: 0;
               display: flex;
               align-items: center;
               justify-content: center;
               font-size: 0.85rem;
               color: ${colors.primary};
               font-weight: 600;
               text-align: center;
               border: 2px dashed ${colors.secondary};
             ">Sin<br>imagen</div>` }

      <!-- Datos del evento -->
      <div style="flex: 1;">
        <h3 style="
          font-size: 1.25rem;
          font-weight: 700;
          margin: 0 0 12px 0;
          color: ${colors.primary};
          line-height: 1.3;
        ">${ev.titulo}</h3>
        
        <div style="
          display: flex;
          flex-direction: column;
          gap: 8px;
          color: ${colors.dark};
        ">
          <p style="
            margin: 0;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <span style="
              background: ${colors.secondary};
              color: white;
              padding: 4px 8px;
              border-radius: 6px;
              font-size: 0.8rem;
              font-weight: 600;
            ">📅</span>
            <strong>Fechas:</strong>
            <span style="color: ${colors.primary};">${inicio}${fin ? ' → ' + fin : ''}</span>
          </p>
          
          <p style="
            margin: 0;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <span style="
              background: ${colors.success};
              color: white;
              padding: 4px 8px;
              border-radius: 6px;
              font-size: 0.8rem;
              font-weight: 600;
            ">📍</span>
            <strong>Ubicación:</strong>
            <span style="color: ${colors.primary};">${ev.locacion?.direccion || '—'}</span>
          </p>
          
          <p style="
            margin: 0;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <span style="
              background: ${colors.primary};
              color: white;
              padding: 4px 8px;
              border-radius: 6px;
              font-size: 0.8rem;
              font-weight: 600;
            ">⚡</span>
            <strong>Estado:</strong>
            <span style="
              background: linear-gradient(135deg, ${colors.success}, #2f855a);
              color: white;
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 0.85rem;
              font-weight: 600;
            ">${ev.estado}</span>
          </p>
        </div>
      </div>
    </article>
  `;
}

function buildCompanyCard(emp) {
  const label = emp.tipo_patrocinio === 'patrocinador' ? 'Patrocinador' : 
                emp.tipo_patrocinio === 'auspiciador' ? 'Auspiciador' : 
                emp.tipo_patrocinio;
  
  const gradientColor = emp.tipo_patrocinio === 'patrocinador' ? 
    `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})` :
    `linear-gradient(135deg, ${colors.success}, #2f855a)`;

  return `
    <article style="
      background: linear-gradient(135deg, ${colors.light}, #fff);
      border-radius: 16px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      border: 2px solid transparent;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    " onmouseover="this.style.borderColor='${colors.secondary}'; this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='transparent'; this.style.transform='translateY(0)';">
      
      <!-- Company logo placeholder -->
      <div style="
        width: 60px;
        height: 60px;
        background: ${gradientColor};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 700;
        font-size: 1.5rem;
        flex-shrink: 0;
      ">
        ${emp.nombre_empresa.charAt(0).toUpperCase()}
      </div>

      <div style="flex: 1;">
        <h3 style="
          font-size: 1.1rem;
          font-weight: 700;
          margin: 0 0 4px 0;
          color: ${colors.dark};
        ">${emp.nombre_empresa}</h3>
        
        <p style="
          margin: 0 0 4px 0;
          font-size: 0.9rem;
          font-weight: 600;
          color: ${emp.tipo_patrocinio === 'patrocinador' ? colors.primary : colors.success};
        ">${label}</p>
        
        <p style="
          margin: 0;
          font-size: 0.8rem;
          color: #666;
        ">${emp.nombre_usuario} • ${emp.correo_electronico}</p>
      </div>
    </article>
  `;
}

// —————— FUNCIÓN DE PARTICIPAR ——————
async function participateAsExternal() {
  if (tipoUsuario !== 'Integrante externo') return;
  const btn  = document.getElementById('btnParticipar');
  const sel  = document.getElementById('selTipoPart');
  const tipo = sel.value;

  btn.disabled = true;
  btn.textContent = 'Registrando…';
  btn.style.background = '#a0a0a0';

  const res  = await fetch(
    `${API_BASE_URL}/api/mega-eventos/${id}/participantes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tipoParticipacion: tipo,
        integranteId: sqlUserId
      })
    }
  );
  const json = await res.json();

  if (!json.success) {
    alert(json.error);
    btn.disabled = false;
    btn.textContent = 'Participar';
    btn.style.background = `linear-gradient(135deg, ${colors.success}, #2f855a)`;
    return;
  }

  alert(json.message);

  // Sólo actualizamos el contador si existe en el DOM
  const totalEl = document.getElementById('totalParticipantes');
  if (totalEl) {
    totalEl.textContent = json.megaEvento.totalParticipantes;
  }

  btn.outerHTML = `
    <div style="
      background: linear-gradient(135deg, ${colors.success}, #2f855a);
      color: white;
      padding: 12px 24px;
      border-radius: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(54, 201, 116, 0.3);
    ">
      <span style="font-size: 1.2rem;">✓</span>
      Ya participas como ${tipo}
    </div>
  `;
}

// —————— FETCH & RENDER MEGA-EVENTO ——————
async function fetchMega() {
  const errEl = document.getElementById('error');
  try {
    const res  = await fetch(`${API_BASE_URL}/api/mega-eventos/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error al cargar mega evento');
    megaEventoActual = json.megaEvento;
    document.getElementById('titulo').textContent = json.megaEvento.titulo;
    render(json.megaEvento, json.estadisticas);
    errEl.classList.add('hidden');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

function render(mega, stats) {
  const d = document.getElementById('detail');
  const absorbidos = mega.eventosAbsorbidos || [];

  let html = `
    <!-- Datos generales -->
    <section style="
      background: linear-gradient(135deg, ${colors.light}, #fff);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 32px;
      border: 2px solid ${colors.secondary};
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
      position: relative;
      overflow: hidden;
    ">
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 6px;
        background: linear-gradient(90deg, ${colors.primary}, ${colors.secondary}, ${colors.success});
      "></div>
      
      <h2 style="
        color: ${colors.primary};
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 24px 0;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <span style="
          background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        ">📋</span>
        Datos generales
      </h2>
      
      <div style="
        display: grid;
        gap: 16px;
        color: ${colors.dark};
      ">
        <div style="
          background: rgba(56, 131, 211, 0.05);
          padding: 16px;
          border-radius: 12px;
          border-left: 4px solid ${colors.primary};
        ">
          <strong style="color: ${colors.primary};">Descripción:</strong>
          <span style="margin-left: 8px;">${mega.descripcion || '—'}</span>
        </div>
        
        <div style="
          background: rgba(33, 191, 196, 0.05);
          padding: 16px;
          border-radius: 12px;
          border-left: 4px solid ${colors.secondary};
        ">
          <strong style="color: ${colors.secondary};">Fechas:</strong>
          <span style="margin-left: 8px;">${new Date(mega.fechaInicio).toLocaleString()} → ${new Date(mega.fechaFin).toLocaleString()}</span>
        </div>
        
        <div style="
          background: rgba(54, 201, 116, 0.05);
          padding: 16px;
          border-radius: 12px;
          border-left: 4px solid ${colors.success};
        ">
          <strong style="color: ${colors.success};">Ubicación:</strong>
          <span style="margin-left: 8px;">${mega.ubicacion.direccion}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
          <div style="
            background: rgba(56, 131, 211, 0.05);
            padding: 12px;
            border-radius: 10px;
            text-align: center;
          ">
            <strong style="color: ${colors.primary};">Categoría</strong><br>
            <span style="font-weight: 600;">${mega.categoria}</span>
          </div>
          
          <div style="
            background: rgba(33, 191, 196, 0.05);
            padding: 12px;
            border-radius: 10px;
            text-align: center;
          ">
            <strong style="color: ${colors.secondary};">Estado</strong><br>
            <span style="
              background: linear-gradient(135deg, ${colors.success}, #2f855a);
              color: white;
              padding: 4px 12px;
              border-radius: 16px;
              font-size: 0.9rem;
              font-weight: 600;
            ">${mega.estado}</span>
          </div>
          
          <div style="
            background: rgba(54, 201, 116, 0.05);
            padding: 12px;
            border-radius: 10px;
            text-align: center;
          ">
            <strong style="color: ${colors.success};">Público</strong><br>
            <span style="font-weight: 600;">${mega.esPublico ? 'Sí' : 'No'}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Imágenes promocionales -->
    <section style="
      background: linear-gradient(135deg, ${colors.light}, #fff);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 32px;
      border: 2px solid ${colors.success};
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    ">
      <h2 style="
        color: ${colors.success};
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 24px 0;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <span style="
          background: linear-gradient(135deg, ${colors.success}, #2f855a);
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        ">🖼️</span>
        Imágenes promocionales
      </h2>
      
      ${mega.imagenPrincipal
        ? `<div style="text-align: center;">
             <img src="${mega.imagenPrincipal.url}" style="
               max-width: 400px;
               border-radius: 16px;
               box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
               border: 3px solid ${colors.success};
             " alt="Imagen promocional"/>
           </div>`
        : `<div style="
             text-align: center;
             padding: 40px;
             background: rgba(54, 201, 116, 0.05);
             border: 2px dashed ${colors.success};
             border-radius: 16px;
             color: ${colors.success};
             font-weight: 600;
           ">
             📷 No hay imágenes promocionales disponibles
           </div>`}
    </section>
  `;

  // Botones y stats solo para ONG
  if (tipoUsuario === 'ONG') {
    html += `
      <section style="
        background: linear-gradient(135deg, ${colors.light}, #fff);
        border-radius: 20px;
        padding: 32px;
        margin-bottom: 32px;
        border: 2px solid ${colors.primary};
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
      ">
        <h2 style="
          color: ${colors.primary};
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0 0 24px 0;
          display: flex;
          align-items: center;
          gap: 12px;
        ">
          <span style="
            background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
          ">📊</span>
          Panel de Control
        </h2>
        
        <div style="
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        ">
          <button id="btnAddEv" style="
            padding: 14px 24px;
            background: linear-gradient(135deg, ${colors.success}, #2f855a);
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 6px 15px rgba(54, 201, 116, 0.3);
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(54, 201, 116, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 15px rgba(54, 201, 116, 0.3)';">
            <span style="font-size: 1.2rem;">➕</span>
            Absorber Eventos
          </button>
          
          <button id="btnRelEv" style="
            padding: 14px 24px;
            background: linear-gradient(135deg, #e53e3e, #c53030);
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 6px 15px rgba(229, 62, 62, 0.3);
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(229, 62, 62, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 15px rgba(229, 62, 62, 0.3)';">
            <span style="font-size: 1.2rem;">➖</span>
            Liberar Eventos
          </button>
          
          <button id="btnChangeState" style="
            padding: 14px 24px;
            background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 6px 15px rgba(56, 131, 211, 0.3);
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(56, 131, 211, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 15px rgba(56, 131, 211, 0.3)';">
            <span style="font-size: 1.2rem;">⚙️</span>
            Cambiar Estado
          </button>
        </div>
      </section>
    `;
  }

  // Sección de inscripción para externos
  if (tipoUsuario === 'Integrante externo' && mega.esPublico && ['convocatoria','organizacion'].includes(mega.estado)) {
    html += `
      <section style="
        background: linear-gradient(135deg, ${colors.success}, #2f855a);
        color: white;
        border-radius: 20px;
        padding: 32px;
        margin-bottom: 32px;
        box-shadow: 0 10px 30px rgba(54, 201, 116, 0.3);
        position: relative;
        overflow: hidden;
      ">
        <div style="
          position: absolute;
          top: -50%;
          right: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
          pointer-events: none;
        "></div>
        
        <h2 style="
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0 0 24px 0;
          display: flex;
          align-items: center;
          gap: 12px;
          position: relative;
        ">
          <span style="
            background: rgba(255, 255, 255, 0.2);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
          ">🎯</span>
          ¡Únete a este Mega-Evento!
        </h2>
        
        <div style="
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 24px;
          display: flex;
          align-items: end;
          gap: 20px;
          flex-wrap: wrap;
        ">
          <div style="flex: 1; min-width: 200px;">
            <label style="
              display: block;
              font-weight: 600;
              margin-bottom: 8px;
              font-size: 0.95rem;
            ">Tipo de participación:</label>
            <select id="selTipoPart" style="
              width: 100%;
              padding: 12px 16px;
              border-radius: 10px;
              border: 2px solid rgba(255, 255, 255, 0.3);
              background: rgba(255, 255, 255, 0.9);
              color: ${colors.dark};
              font-size: 1rem;
              font-weight: 600;
              transition: all 0.3s ease;
            ">
              <option value="participante">🙋‍♂️ Participante</option>
              <option value="voluntario">🤝 Voluntario</option>
              <option value="ponente">🎤 Ponente</option>
              <option value="facilitador">👨‍🏫 Facilitador</option>
            </select>
          </div>
          
          <button id="btnParticipar" style="
            padding: 14px 28px;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.8));
            color: ${colors.success};
            border: none;
            border-radius: 12px;
            font-weight: 700;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0, 0, 0, 0.3)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.2)';">
            <span style="font-size: 1.2rem;">🚀</span>
            Participar Ahora
          </button>
        </div>
      </section>
    `;
  }

  // Lista de eventos absorbidos
  html += `
    <section style="
      background: linear-gradient(135deg, ${colors.light}, #fff);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 32px;
      border: 2px solid ${colors.secondary};
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    ">
      <h2 style="
        color: ${colors.secondary};
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 24px 0;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <span style="
          background: linear-gradient(135deg, ${colors.secondary}, ${colors.primary});
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        ">🎪</span>
        Eventos absorbidos
        <span style="
          background: ${colors.secondary};
          color: white;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 0.9rem;
          font-weight: 600;
        ">${absorbidos.length}</span>
      </h2>
      
      ${absorbidos.length
        ? absorbidos.map(buildEventCard).join('')
        : `<div style="
             text-align: center;
             padding: 40px;
             background: rgba(33, 191, 196, 0.05);
             border: 2px dashed ${colors.secondary};
             border-radius: 16px;
             color: ${colors.secondary};
             font-weight: 600;
           ">
             🎭 No hay eventos absorbidos en este mega-evento
           </div>`}
    </section>
  `;

  // Empresas patrocinadoras y auspiciadoras
  html += `
    <section style="
      background: linear-gradient(135deg, ${colors.light}, #fff);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 24px;
      border: 2px solid ${colors.primary};
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    ">
      <h2 style="
        color: ${colors.primary};
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 24px 0;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <span style="
          background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        ">🏢</span>
        Empresas patrocinadoras
        <span style="
          background: ${colors.primary};
          color: white;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 0.9rem;
          font-weight: 600;
        ">${mega.empresasPatrocinadoras.length}</span>
      </h2>
      
      ${mega.empresasPatrocinadoras.length
        ? mega.empresasPatrocinadoras.map(buildCompanyCard).join('')
        : `<div style="
             text-align: center;
             padding: 40px;
             background: rgba(56, 131, 211, 0.05);
             border: 2px dashed ${colors.primary};
             border-radius: 16px;
             color: ${colors.primary};
             font-weight: 600;
           ">
             🤝 No hay empresas patrocinadoras registradas
           </div>`}
    </section>

    <section style="
      background: linear-gradient(135deg, ${colors.light}, #fff);
      border-radius: 20px;
      padding: 32px;
      margin-bottom: 32px;
      border: 2px solid ${colors.success};
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    ">
      <h2 style="
        color: ${colors.success};
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 24px 0;
        display: flex;
        align-items: center;
        gap: 12px;
      ">
        <span style="
          background: linear-gradient(135deg, ${colors.success}, #2f855a);
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        ">🌟</span>
        Empresas auspiciadoras
        <span style="
          background: ${colors.success};
          color: white;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 0.9rem;
          font-weight: 600;
        ">${mega.empresasAuspiciadoras.length}</span>
      </h2>
      
      ${mega.empresasAuspiciadoras.length
        ? mega.empresasAuspiciadoras.map(buildCompanyCard).join('')
        : `<div style="
             text-align: center;
             padding: 40px;
             background: rgba(54, 201, 116, 0.05);
             border: 2px dashed ${colors.success};
             border-radius: 16px;
             color: ${colors.success};
             font-weight: 600;
           ">
             ⭐ No hay empresas auspiciadoras registradas
           </div>`}
    </section>
  `;

  d.innerHTML = html;

  // Event listeners
  if (tipoUsuario === 'ONG') {
    document.getElementById('btnAddEv').onclick = openAbsorbModal;
    document.getElementById('btnRelEv').onclick = openReleaseModal;
    document.getElementById('btnChangeState').onclick = openChangeStateModal;
  }
  document.getElementById('btnParticipar')?.addEventListener('click', participateAsExternal);
}

fetchMega();