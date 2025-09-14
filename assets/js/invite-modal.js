/* ../../scripts/assets/invite-modal.js */
const ROL_POR_DEFECTO = {
  vip            : 'invitado_honor',
  ponente        : 'ponente',
  conferencista  : 'ponente',
  facilitador    : 'facilitador',
  panelista      : 'panelista',
  artista        : 'artista'
};

export const ROLES_EVENTO = [
  'ponente',
  'moderador',
  'facilitador',
  'panelista',
  'staff',
  'voluntario',
  'organizador',
  'artista',
  'invitado_honor'
];

export function openInviteModal(eventId, authToken, onSave = () => {}) {
  const modal = document.createElement('div');
  modal.id = 'inviteModal';
  modal.innerHTML = `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-[24rem] text-gray-800">
        <h2 class="text-xl font-semibold mb-4">Agregar invitado</h2>

        <form id="formInvite" class="space-y-3">
          <!-- Datos básicos -->
          <div>
            <label class="block text-sm">Cédula identidad *</label>
            <input name="cedula_identidad" required class="w-full px-3 py-2 border rounded">
          </div>
          <details class="border rounded p-2">
            <summary class="cursor-pointer text-sm text-gray-600">Datos (solo si no existe)</summary>
            <div class="space-y-3 mt-3">
              <div>
                <label class="block text-sm">Nombres</label>
                <input name="nombres" class="w-full px-3 py-2 border rounded">
              </div>
              <div>
                <label class="block text-sm">Apellidos</label>
                <input name="apellidos" class="w-full px-3 py-2 border rounded">
              </div>
              <div>
                <label class="block text-sm">Email</label>
                <input name="email" type="email" class="w-full px-3 py-2 border rounded">
              </div>
              <div>
                <label class="block text-sm">Teléfono</label>
                <input name="telefono" class="w-full px-3 py-2 border rounded">
              </div>
              <div>
                <label class="block text-sm">Tipo invitado</label>
                <select name="tipo_invitado" class="w-full px-3 py-2 border rounded">
                  <option value="vip">VIP</option>
                  <option value="ponente">Ponente</option>
                  <option value="facilitador">Facilitador</option>
                  <option value="conferencista">Conferencista</option>
                  <option value="panelista">Panelista</option>
                  <option value="artista">Artista</option>
                </select>
              </div>
            </div>
          </details>

          <!-- Rol -->
          <div>
            <label class="block text-sm">Rol dentro del evento *</label>
            <select name="rol_evento" class="w-full px-3 py-2 border rounded">
              ${ROLES_EVENTO.map(r => `<option value="${r}">${r.charAt(0).toUpperCase()+r.slice(1)}</option>`).join('')}
            </select>
          </div>

          <!-- Imagen opcional -->
          <div>
            <label class="block text-sm">Foto invitado (opcional)</label>
            <input type="file" name="foto" accept="image/*" class="w-full px-1 py-2 border rounded">
          </div>

          <!-- Observaciones -->
          <div>
            <label class="block text-sm">Observaciones</label>
            <textarea name="observaciones" rows="2" class="w-full px-3 py-2 border rounded"></textarea>
          </div>

          <!-- Botones -->
          <div class="flex justify-end gap-2 pt-3">
            <button type="button" id="cancelInvite"
                    class="px-4 py-2 bg-gray-200 rounded">Cancelar</button>
            <button type="submit"
                    class="px-4 py-2 bg-blue-600 text-white rounded">Guardar</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.append(modal);

  const tipoSel = modal.querySelector('select[name="tipo_invitado"]');
  const rolSel  = modal.querySelector('select[name="rol_evento"]');
  const syncRol = () => {
    const defecto = ROL_POR_DEFECTO[tipoSel.value];
    if (defecto) rolSel.value = defecto;
  };
  syncRol();
  tipoSel.addEventListener('change', syncRol);

  // cerrar
  modal.querySelector('#cancelInvite').onclick = () => modal.remove();

  // helper para leer file a base64
  const fileToBase64 = file => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result.split(',')[1]);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });

  // submit
  // submit
  modal.querySelector('#formInvite').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    const formData = new FormData();

    // 1) Campos de texto / select
    formData.append('invitados', JSON.stringify([{
      cedula_identidad: f.cedula_identidad.value.trim(),
      nombres:          f.nombres.value.trim()      || undefined,
      apellidos:        f.apellidos.value.trim()    || undefined,
      email:            f.email.value.trim()        || undefined,
      telefono:         f.telefono.value.trim()     || undefined,
      tipo_invitado:    f.tipo_invitado.value       || undefined,
      rol_evento:       f.rol_evento.value.trim(),
      observaciones:    f.observaciones.value.trim()|| undefined
    }]));

    // 2) La foto (si hay)
    const fileInput = f.querySelector('input[type="file"][name="foto"]');
    if (fileInput.files.length) {
      formData.append('foto', fileInput.files[0]);
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/list/evento/${eventId}/crear-lista`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`
            // ¡no pongas Content-Type aquí! fetch lo rellenará por ti.
          },
          body: formData
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      alert('Invitado procesado correctamente');
      onSave();           // refresca la lista
      modal.remove();
    } catch (err) {
      alert(err.message);
    }
  };

}
