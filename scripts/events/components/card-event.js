// scripts/components/card-event.js
export function createCard(it) {
  const inicio = new Date(it.fechaInicio).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  
 const badge = it.type === 'evento' ? 'Evento' : 'Mega-Evento';
 const badgeColor = it.type === 'evento' ? 'bg-emerald-500' : 'bg-purple-600';
  
  // Estado con colores
  const estadoColors = {
    publicado: 'bg-green-500',
    borrador: 'bg-gray-500',
    convocatoria: 'bg-blue-500',
    organizacion: 'bg-orange-500'
  };
  const estadoColor = estadoColors[it.estado?.toLowerCase()] || 'bg-gray-500';

  const card = document.createElement('article');
  card.className = `
    group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl 
    transition-all duration-300 transform hover:-translate-y-2 
    overflow-hidden cursor-pointer border border-gray-100
    hover:border-transparent
  `;

  // Contenido con diseño mejorado
  card.innerHTML = `
    <!-- Imagen con overlay gradient -->
    <div class="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
      ${it.imagenPrincipal?.url 
        ? `<img src="${it.imagenPrincipal.url}" alt="${it.titulo}"
                 class="absolute inset-0 w-full h-full object-cover transition-transform 
                        duration-700 group-hover:scale-110">
           <!-- Overlay gradient para mejor legibilidad -->
           <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent 
                       opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>`
        : `<div class="w-full h-full flex items-center justify-center">
             <svg class="w-16 h-16 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
               <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" />
             </svg>
           </div>`}
      
      <!-- Badges flotantes -->
      <div class="absolute top-3 left-3 flex flex-col gap-2">
        <span class="${badgeColor} text-white text-xs font-bold 
                     rounded-full px-3 py-1 shadow-lg backdrop-blur-sm bg-opacity-90
                     transform transition-transform group-hover:scale-105">
          ${badge}
        </span>
        <span class="${estadoColor} text-white text-xs font-semibold 
                     rounded-full px-3 py-1 shadow-lg backdrop-blur-sm bg-opacity-90
                     transform transition-transform group-hover:scale-105">
          ${it.estado}
        </span>
      </div>

      <!-- Fecha flotante en esquina superior derecha -->
      <div class="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg
                  transform transition-transform group-hover:scale-105">
        <div class="text-xs font-bold text-gray-700">${new Date(it.fechaInicio).getDate()}</div>
        <div class="text-xs text-gray-500">${new Date(it.fechaInicio).toLocaleDateString('es-ES', { month: 'short' }).toUpperCase()}</div>
      </div>
    </div>

    <!-- Contenido -->
    <div class="p-5">
      <!-- Título con altura fija para alineación -->
      <h3 class="text-lg font-bold text-gray-800 mb-3 line-clamp-2 min-h-[3.5rem] 
                 group-hover:text-brand-marino transition-colors">
        ${it.titulo}
      </h3>

      <!-- Información adicional con iconos -->
      <div class="space-y-2 mb-4">
        ${it.locacion?.ciudad ? `
          <div class="flex items-center text-sm text-gray-600">
            <svg class="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            <span>${it.locacion.ciudad}</span>
          </div>
        ` : ''}
        
        ${it.categoria ? `
          <div class="flex items-center text-sm text-gray-600">
            <svg class="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
            </svg>
            <span>${it.categoria}</span>
          </div>
        ` : ''}
      </div>

      <!-- Separador visual -->
      <div class="h-px bg-gray-200 mb-4"></div>

      <!-- Footer con botón -->
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">
          Click para ver detalles
        </div>
        
        <!-- Botón con animación -->
        <div class="bg-brand-cian text-white rounded-full p-2 
                    transform transition-all duration-300 
                    group-hover:bg-brand-lima group-hover:scale-110 group-hover:rotate-12">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
          </svg>
        </div>
      </div>
    </div>

    <!-- Efecto de brillo al hover -->
    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent 
                opacity-0 group-hover:opacity-10 transform -skew-x-12 -translate-x-full 
                group-hover:translate-x-full transition-all duration-1000 pointer-events-none"></div>
  `;

  return card;
}