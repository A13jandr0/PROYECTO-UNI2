// dashboard-eventos.js

class DashboardEventos {
    constructor() {
        this.baseURL = 'http://localhost:3000/api/dashboard/eventos';
        this.filtros = {};
        this.charts = {};
        this.currentTab = 'general';
        
        this.init();
    }
    

    async init() {
        await this.cargarFiltros();
        await this.cargarDashboard();
        this.configurarEventListeners();
    }

    async cargarFiltros() {
        try {
            // Cargar ONGs para el filtro
            const response = await fetch('http://localhost:3000/api/dashboard/filtros/disponibles');
            const data = await response.json();
            
            if (data.success) {
                const ongSelect = document.getElementById('ongFilter');
                data.filtros.organizaciones.ongs.forEach(ong => {
                    const option = document.createElement('option');
                    option.value = ong.id;
                    option.textContent = ong.nombre;
                    ongSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error cargando filtros:', error);
        }
    }

    configurarEventListeners() {
        // Configurar fechas por defecto (último mes)
        const hoy = new Date();
        const haceMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate());
        
        document.getElementById('fechaInicio').value = haceMes.toISOString().split('T')[0];
        document.getElementById('fechaFin').value = hoy.toISOString().split('T')[0];
    }

    async cargarDashboard() {
        await this.cargarDashboardGeneral();
    }

    async cargarDashboardGeneral() {
        try {
            this.mostrarLoading('statsGeneral');
            
            const params = new URLSearchParams(this.filtros);
            const response = await fetch(`${this.baseURL}/general?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderStatsGeneral(data.dashboard);
                this.renderChartsGeneral(data.dashboard);
                this.renderTopOngs(data.dashboard.topOngsActivas);
            } else {
                this.mostrarError('Error cargando dashboard general');
            }
        } catch (error) {
            console.error('Error:', error);
            this.mostrarError('Error de conexión');
        }
    }

    async cargarDashboardParticipacion() {
        try {
            this.mostrarLoading('statsParticipacion');
            
            const params = new URLSearchParams(this.filtros);
            const response = await fetch(`${this.baseURL}/participacion?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderStatsParticipacion(data.dashboard);
                this.renderChartsParticipacion(data.dashboard);
                this.renderMayorParticipacion(data.dashboard.eventosMayorParticipacion);
            }
        } catch (error) {
            console.error('Error:', error);
            this.mostrarError('Error cargando dashboard de participación');
        }
    }

    async cargarDashboardPatrocinios(filtros = {}) {
        try {
            // Mostrar loading
            mostrarLoading('statsPatrocinios');
            mostrarLoading('patrociniosTipoChart', true);
            mostrarLoading('topEmpresasChart', true);
            mostrarLoading('mayorApoyoTable', true);
            
            // Construir query params
            const params = new URLSearchParams();
            if (filtros.fechaInicio) params.append('fechaInicio', filtros.fechaInicio);
            if (filtros.fechaFin) params.append('fechaFin', filtros.fechaFin);
            
            // Llamar al endpoint
            const response = await fetch(`http://localhost:3000/api/dashboard/eventos/patrocinios?${params}`);
            const data = await response.json();
            
            if (data.success) {
                dashboardData.patrocinios = data.dashboard;
                renderizarDashboardPatrocinios(data.dashboard);
            } else {
                mostrarError('Error al cargar datos de patrocinios');
            }
        } catch (error) {
            console.error('Error:', error);
            mostrarError('Error al conectar con el servidor');
        }
    }

    async cargarDashboardOngs() {
        try {
            this.mostrarLoading('statsOngs');
            
            const params = new URLSearchParams(this.filtros);
            const response = await fetch(`${this.baseURL}/ongs?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderStatsOngs(data.dashboard);
                this.renderChartsOngs(data.dashboard);
            }
        } catch (error) {
            console.error('Error:', error);
            this.mostrarError('Error cargando dashboard de ONGs');
        }
    }

    async cargarDashboardTendencias() {
        try {
            this.mostrarLoading('statsTendencias');
            
            const params = new URLSearchParams(this.filtros);
            const response = await fetch(`${this.baseURL}/tendencias?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderStatsTendencias(data.dashboard);
                this.renderChartsTendencias(data.dashboard);
            }
        } catch (error) {
            console.error('Error:', error);
            this.mostrarError('Error cargando dashboard de tendencias');
        }
    }

    renderStatsGeneral(dashboard) {
        const stats = dashboard.resumenGeneral;
        const container = document.getElementById('statsGeneral');
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon primary">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                    <div class="stat-change positive">+${Math.round(Math.random() * 20)}%</div>
                </div>
                <div class="stat-value">${stats.totalEventos || 0}</div>
                <div class="stat-label">Total Eventos</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min((stats.eventosPublicados / stats.totalEventos) * 100, 100)}%"></div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon success">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-change positive">+${Math.round(Math.random() * 15)}%</div>
                </div>
                <div class="stat-value">${(stats.totalParticipantesInscritos || 0).toLocaleString()}</div>
                <div class="stat-label">Participantes Inscritos</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${stats.tasaAsistenciaPromedio || 0}%"></div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon warning">
                        <i class="fas fa-percentage"></i>
                    </div>
                    <div class="stat-change ${stats.tasaAsistenciaPromedio > 70 ? 'positive' : 'negative'}">
                        ${stats.tasaAsistenciaPromedio || 0}%
                    </div>
                </div>
                <div class="stat-value">${stats.tasaAsistenciaPromedio || 0}%</div>
                <div class="stat-label">Tasa Asistencia Promedio</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${stats.tasaAsistenciaPromedio || 0}%"></div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon info">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-change ${stats.tasaFinalizacion > 80 ? 'positive' : 'negative'}">
                        ${stats.tasaFinalizacion || 0}%
                    </div>
                </div>
                <div class="stat-value">${stats.tasaFinalizacion || 0}%</div>
                <div class="stat-label">Tasa Finalización</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${stats.tasaFinalizacion || 0}%"></div>
                </div>
            </div>
        `;
    }

    renderChartsGeneral(dashboard) {
        // Chart de estados
        this.destroyChart('estadosChart');
        const estadosCtx = document.getElementById('estadosChart').getContext('2d');
        this.charts.estadosChart = new Chart(estadosCtx, {
            type: 'doughnut',
            data: {
                labels: dashboard.distribucionEstados.map(e => e._id),
                datasets: [{
                    data: dashboard.distribucionEstados.map(e => e.count),
                    backgroundColor: [
                        '#667eea',
                        '#764ba2',
                        '#48bb78',
                        '#ed8936',
                        '#4299e1',
                        '#9f7aea'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });

        // Chart de tipos
        this.destroyChart('tiposChart');
        const tiposCtx = document.getElementById('tiposChart').getContext('2d');
        this.charts.tiposChart = new Chart(tiposCtx, {
            type: 'bar',
            data: {
                labels: dashboard.eventosPorTipo.map(e => e._id),
                datasets: [{
                    label: 'Eventos',
                    data: dashboard.eventosPorTipo.map(e => e.count),
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: '#667eea',
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    renderTopOngs(ongs) {
        const tbody = document.querySelector('#topOngsTable tbody');
        tbody.innerHTML = '';

        ongs.forEach((ong, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="badge ${index < 3 ? 'success' : 'info'}">#${index + 1}</span>
                        <strong>${ong.nombreOng || 'ONG Desconocida'}</strong>
                    </div>
                    <div style="font-size: 0.8rem; color: #64748b;">
                        ${ong.nombreUsuario || ''}
                    </div>
                </td>
                <td><strong>${ong.totalEventos}</strong></td>
                <td>${ong.totalParticipantes.toLocaleString()}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span>${Math.round(ong.promedioAsistencia || 0)}%</span>
                        <div class="progress-bar" style="width: 60px; height: 4px;">
                            <div class="progress-fill" style="width: ${ong.promedioAsistencia || 0}%"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge info">
                        ${(ong.patrocinios?.totalPatrocinadores || 0) + (ong.patrocinios?.totalAuspiciadores || 0)}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    renderStatsParticipacion(dashboard) {
        const container = document.getElementById('statsParticipacion');
        
        const totalParticipantes = dashboard.participacionPorTipo.reduce((sum, p) => sum + p.totalParticipantes, 0);
        const promedioAsistencia = dashboard.participacionPorTipo.reduce((sum, p) => sum + p.tasaAsistencia, 0) / dashboard.participacionPorTipo.length || 0;
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon primary">
                        <i class="fas fa-user-friends"></i>
                    </div>
                </div>
                <div class="stat-value">${totalParticipantes.toLocaleString()}</div>
                <div class="stat-label">Total Participantes</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon success">
                        <i class="fas fa-chart-line"></i>
                    </div>
                </div>
                <div class="stat-value">${Math.round(promedioAsistencia)}%</div>
                <div class="stat-label">Asistencia Promedio</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon warning">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                </div>
                <div class="stat-value">${dashboard.eventosSobrecapacidad?.length || 0}</div>
                <div class="stat-label">Eventos Sobrecapacidad</div>
            </div>
        `;
    }

    renderChartsParticipacion(dashboard) {
        // Chart participación por tipo
        this.destroyChart('participacionTipoChart');
        const participacionCtx = document.getElementById('participacionTipoChart').getContext('2d');
        this.charts.participacionTipoChart = new Chart(participacionCtx, {
            type: 'pie',
            data: {
                labels: dashboard.participacionPorTipo.map(p => p._id || 'Sin tipo'),
                datasets: [{
                    data: dashboard.participacionPorTipo.map(p => p.totalParticipantes),
                    backgroundColor: [
                        '#667eea',
                        '#48bb78',
                        '#ed8936',
                        '#4299e1',
                        '#9f7aea'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });

        // Chart análisis asistencia
        this.destroyChart('asistenciaChart');
        const asistenciaCtx = document.getElementById('asistenciaChart').getContext('2d');
        this.charts.asistenciaChart = new Chart(asistenciaCtx, {
            type: 'bar',
            data: {
                labels: dashboard.analisisAsistencia.map(a => a._id),
                datasets: [{
                    label: 'Eventos',
                    data: dashboard.analisisAsistencia.map(a => a.totalEventos),
                    backgroundColor: 'rgba(72, 187, 120, 0.8)',
                    borderColor: '#48bb78',
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderMayorParticipacion(eventos) {
        const tbody = document.querySelector('#mayorParticipacionTable tbody');
        tbody.innerHTML = '';

        eventos.slice(0, 10).forEach((evento, index) => {
            const row = document.createElement('tr');
            const fecha = new Date(evento.fechaInicio).toLocaleDateString('es-ES');
            
            row.innerHTML = `
                <td>
                    <strong>${evento.titulo}</strong>
                </td>
                <td>${fecha}</td>
                <td><span class="badge info">${evento.tipoEvento}</span></td>
                <td><strong>${evento.totalInscritos}</strong></td>
                <td>${evento.totalAsistentes}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span>${evento.porcentajeAsistencia || 0}%</span>
                        <div class="progress-bar" style="width: 60px; height: 4px;">
                            <div class="progress-fill" style="width: ${evento.porcentajeAsistencia || 0}%"></div>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    renderStatsPatrocinios(dashboard) {
        const stats = dashboard.estadisticasGenerales;
        const container = document.getElementById('statsPatrocinios');
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon primary">
                        <i class="fas fa-building"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalEmpresasPatrocinadoras || 0}</div>
                <div class="stat-label">Empresas Patrocinadoras</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon success">
                        <i class="fas fa-handshake"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalEmpresasAuspiciadoras || 0}</div>
                <div class="stat-label">Empresas Auspiciadoras</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon warning">
                        <i class="fas fa-calendar-check"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalEventosPatrocinados || 0}</div>
                <div class="stat-label">Eventos Patrocinados</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon info">
                        <i class="fas fa-trophy"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalPatrocinios || 0}</div>
                <div class="stat-label">Total Patrocinios</div>
            </div>
        `;
    }

    renderChartsPatrocinios(dashboard) {
        // Chart patrocinios por tipo de evento
        this.destroyChart('patrociniosTipoChart');
        const patrociniosCtx = document.getElementById('patrociniosTipoChart').getContext('2d');
        this.charts.patrociniosTipoChart = new Chart(patrociniosCtx, {
            type: 'bar',
            data: {
                labels: dashboard.patrociniosPorTipoEvento.map(p => p.Tipo_evento),
                datasets: [{
                    label: 'Empresas Involucradas',
                    data: dashboard.patrociniosPorTipoEvento.map(p => p.totalEmpresasInvolucradas),
                    backgroundColor: 'rgba(237, 137, 54, 0.8)',
                    borderColor: '#ed8936',
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

        // Chart top empresas
        this.destroyChart('topEmpresasChart');
        const empresasCtx = document.getElementById('topEmpresasChart').getContext('2d');
        const topEmpresas = dashboard.topEmpresasPatrocinadoras.slice(0, 8);
        
        this.charts.topEmpresasChart = new Chart(empresasCtx, {
            type: 'horizontalBar',
            data: {
                labels: topEmpresas.map(e => e.nombre_empresa),
                datasets: [{
                    label: 'Eventos Patrocinados',
                    data: topEmpresas.map(e => e.totalEventosPatrocinados),
                    backgroundColor: 'rgba(66, 153, 225, 0.8)',
                    borderColor: '#4299e1',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderMayorApoyo(eventos) {
        const tbody = document.querySelector('#mayorApoyoTable tbody');
        tbody.innerHTML = '';

        eventos.slice(0, 10).forEach(evento => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td><strong>${evento.Tittulo}</strong></td>
                <td>${evento.nombre_ong}</td>
                <td><span class="badge success">${evento.totalPatrocinadores}</span></td>
                <td><span class="badge info">${evento.totalAuspiciadores}</span></td>
                <td><span class="badge warning">${evento.totalEmpresasApoyo}</span></td>
            `;
            tbody.appendChild(row);
        });
    }

    renderStatsOngs(dashboard) {
        const container = document.getElementById('statsOngs');
        const totalOngs = dashboard.rankingOngs.length;
        const promEventosPorOng = totalOngs > 0 
            ? dashboard.rankingOngs.reduce((sum, ong) => sum + ong.totalEventos, 0) / totalOngs 
            : 0;
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon primary">
                        <i class="fas fa-building-columns"></i>
                    </div>
                </div>
                <div class="stat-value">${totalOngs}</div>
                <div class="stat-label">ONGs Activas</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon success">
                        <i class="fas fa-chart-bar"></i>
                    </div>
                </div>
                <div class="stat-value">${Math.round(promEventosPorOng)}</div>
                <div class="stat-label">Promedio Eventos/ONG</div>
            </div>
        `;
    }

    renderChartsOngs(dashboard) {
        // Chart ranking ONGs
        this.destroyChart('rankingOngsChart');
        const rankingCtx = document.getElementById('rankingOngsChart').getContext('2d');
        const topOngs = dashboard.rankingOngs.slice(0, 10);
        
        this.charts.rankingOngsChart = new Chart(rankingCtx, {
            type: 'bar',
            data: {
                labels: topOngs.map(ong => ong.nombreOng || `ONG ${ong._id}`),
                datasets: [{
                    label: 'Total Participantes',
                    data: topOngs.map(ong => ong.totalParticipantes),
                    backgroundColor: 'rgba(159, 122, 234, 0.8)',
                    borderColor: '#9f7aea',
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    },
                    x: {
                        ticks: {
                            maxRotation: 45
                        }
                    }
                }
            }
        });

        // Chart diversidad
        this.destroyChart('diversidadChart');
        const diversidadCtx = document.getElementById('diversidadChart').getContext('2d');
        
        this.charts.diversidadChart = new Chart(diversidadCtx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'ONGs',
                    data: dashboard.diversidadEventos.map(ong => ({
                        x: ong.diversidadTipos,
                        y: ong.tiposEventos.reduce((sum, tipo) => sum + tipo.cantidad, 0)
                    })),
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: '#667eea',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Diversidad de Tipos'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Total Eventos'
                        }
                    }
                }
            }
        });
    }

    renderStatsTendencias(dashboard) {
        const container = document.getElementById('statsTendencias');
        const ultimosPeriodos = dashboard.tendenciaEventos.slice(-6);
        const crecimiento = ultimosPeriodos.length > 1 
            ? ((ultimosPeriodos[ultimosPeriodos.length - 1].totalEventos - ultimosPeriodos[0].totalEventos) / ultimosPeriodos[0].totalEventos * 100)
            : 0;
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon primary">
                        <i class="fas fa-trending-up"></i>
                    </div>
                    <div class="stat-change ${crecimiento > 0 ? 'positive' : 'negative'}">
                        ${crecimiento > 0 ? '+' : ''}${Math.round(crecimiento)}%
                    </div>
                </div>
                <div class="stat-value">${Math.round(crecimiento)}%</div>
                <div class="stat-label">Crecimiento</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon success">
                        <i class="fas fa-calendar-week"></i>
                    </div>
                </div>
                <div class="stat-value">${dashboard.tendenciaEventos.length}</div>
                <div class="stat-label">Períodos Analizados</div>
            </div>
        `;

        if (dashboard.prediccion) {
            container.innerHTML += `
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon info">
                            <i class="fas fa-crystal-ball"></i>
                        </div>
                        <div class="stat-change info">
                            ${dashboard.prediccion.confianza}
                        </div>
                    </div>
                    <div class="stat-value">${dashboard.prediccion.proximoPeriodo}</div>
                    <div class="stat-label">Predicción Próximo Período</div>
                </div>
            `;
        }
    }

    renderChartsTendencias(dashboard) {
        // Chart evolución temporal
        this.destroyChart('evolucionChart');
        const evolucionCtx = document.getElementById('evolucionChart').getContext('2d');
        
        this.charts.evolucionChart = new Chart(evolucionCtx, {
            type: 'line',
            data: {
                labels: dashboard.tendenciaEventos.map(t => `${t._id.mes || t._id.semana || ''}/${t._id.año}`),
                datasets: [{
                    label: 'Eventos',
                    data: dashboard.tendenciaEventos.map(t => t.totalEventos),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Participantes',
                    data: dashboard.tendenciaEventos.map(t => t.totalParticipantes / 10), // Escalar para visualización
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

        // Chart estacionalidad
        this.destroyChart('estacionalChart');
        const estacionalCtx = document.getElementById('estacionalChart').getContext('2d');
        
        this.charts.estacionalChart = new Chart(estacionalCtx, {
            type: 'radar',
            data: {
                labels: dashboard.estacionalidad.map(e => e.nombreMes),
                datasets: [{
                    label: 'Eventos por Mes',
                    data: dashboard.estacionalidad.map(e => e.totalEventos),
                    borderColor: '#ed8936',
                    backgroundColor: 'rgba(237, 137, 54, 0.2)',
                    borderWidth: 2,
                    pointBackgroundColor: '#ed8936'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    mostrarLoading(containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner"></i>
                Cargando datos...
            </div>
        `;
    }

    mostrarError(mensaje) {
        console.error(mensaje);
        // Podrías mostrar una notificación de error aquí
    }

    destroyChart(chartId) {
        if (this.charts[chartId]) {
            this.charts[chartId].destroy();
            delete this.charts[chartId];
        }
    }
}

// Funciones globales
function cambiarTab(tabName) {
    // Cambiar tabs activos
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`[onclick="cambiarTab('${tabName}')"]`).classList.add('active');
    
    // Cambiar contenido activo
    document.querySelectorAll('.dashboard-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    
    // Cargar datos del tab correspondiente
    const dashboard = window.dashboardEventos;
    dashboard.currentTab = tabName;
    
    switch(tabName) {
        case 'general':
            dashboard.cargarDashboardGeneral();
            break;
        case 'participacion':
            dashboard.cargarDashboardParticipacion();
            break;
        case 'patrocinios':
            dashboard.cargarDashboardPatrocinios();
            break;
    }
}

function aplicarFiltros() {
    const dashboard = window.dashboardEventos;
    
    // Recoger filtros
    dashboard.filtros = {};
    
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    const ongId = document.getElementById('ongFilter').value;
    
    if (fechaInicio) dashboard.filtros.fechaInicio = fechaInicio;
    if (fechaFin) dashboard.filtros.fechaFin = fechaFin;
    if (ongId) dashboard.filtros.ongId = ongId;
    
    // Recargar dashboard actual
    cambiarTab(dashboard.currentTab);
}

function limpiarFiltros() {
    document.getElementById('fechaInicio').value = '';
    document.getElementById('fechaFin').value = '';
    document.getElementById('ongFilter').value = '';
    
    window.dashboardEventos.filtros = {};
    cambiarTab(window.dashboardEventos.currentTab);
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardEventos = new DashboardEventos();
});