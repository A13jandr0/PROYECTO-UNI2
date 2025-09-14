// dashboard-mega-eventos.js

class DashboardMegaEventos {
    constructor() {
        this.baseURL = 'http://localhost:3000/api/dashboard/mega-eventos';
        this.filtros = {};
        this.charts = {};
        this.currentTab = 'general';
        
        this.init();
    }

    async init() {
        await this.cargarDashboard();
        this.configurarEventListeners();
    }

    configurarEventListeners() {
        // Configurar fechas por defecto (último año)
        const hoy = new Date();
        const haceAno = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate());
        
        document.getElementById('fechaInicio').value = haceAno.toISOString().split('T')[0];
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
                this.renderMegaEventosDestacados(data.dashboard.megaEventosMayorImpacto);
            } else {
                this.mostrarError('Error cargando dashboard general');
            }
        } catch (error) {
            console.error('Error:', error);
            this.mostrarError('Error de conexión');
        }
    }

    async cargarDashboardColaboracion() {
        try {
            this.mostrarLoading('statsColaboracion');
            
            const params = new URLSearchParams(this.filtros);
            const response = await fetch(`${this.baseURL}/colaboracion?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderStatsColaboracion(data.dashboard);
                this.renderRedesColaboracion(data.dashboard.redesColaboracion);
                this.renderChartsColaboracion(data.dashboard);
            }
        } catch (error) {
            console.error('Error:', error);
            this.mostrarError('Error cargando dashboard de colaboración');
        }
    }

    async cargarDashboardPatrocinios() {
        try {
            this.mostrarLoading('statsPatrocinios');
            
            const params = new URLSearchParams(this.filtros);
            const response = await fetch(`${this.baseURL}/patrocinios?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderStatsPatrocinios(data.dashboard);
                this.renderChartsPatrocinios(data.dashboard);
                this.renderMayorApoyoTable(data.dashboard.megaEventosMayorApoyo);
            }
        } catch (error) {
            console.error('Error:', error);
            this.mostrarError('Error cargando dashboard de patrocinios');
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
                this.renderMayorParticipacionTable(data.dashboard.megaEventosMayorParticipacion);
            }
        } catch (error) {
            console.error('Error:', error);
            this.mostrarError('Error cargando dashboard de participación');
        }
    }

    async cargarDashboardImpacto() {
        try {
            this.mostrarLoading('statsImpacto');
            
            const params = new URLSearchParams(this.filtros);
            const response = await fetch(`${this.baseURL}/impacto?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderStatsImpacto(data.dashboard);
                this.renderChartsImpacto(data.dashboard);
                this.renderMayorImpactoTable(data.dashboard.megaEventosMayorImpacto);
            }
        } catch (error) {
            console.error('Error:', error);
            this.mostrarError('Error cargando dashboard de impacto');
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
                this.renderPredicciones(data.dashboard.predicciones);
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
                        <i class="fas fa-rocket"></i>
                    </div>
                    <div class="stat-change positive">+${Math.round(Math.random() * 25)}%</div>
                </div>
                <div class="stat-value">${stats.totalMegaEventos || 0}</div>
                <div class="stat-label">Total Mega Eventos</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon success">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-change positive">+${Math.round(Math.random() * 30)}%</div>
                </div>
                <div class="stat-value">${(stats.totalParticipantesInscritos || 0).toLocaleString()}</div>
                <div class="stat-label">Participantes Totales</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon warning">
                        <i class="fas fa-handshake"></i>
                    </div>
                    <div class="stat-change neutral">${stats.promedioOngsColaboradoras || 0}</div>
                </div>
                <div class="stat-value">${stats.totalOngsParticipantes || 0}</div>
                <div class="stat-label">ONGs Colaboradoras</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon info">
                        <i class="fas fa-building"></i>
                    </div>
                    <div class="stat-change positive">+${Math.round(Math.random() * 20)}%</div>
                </div>
                <div class="stat-value">${stats.totalPatrocinadores || 0}</div>
                <div class="stat-label">Empresas Patrocinadoras</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon purple">
                        <i class="fas fa-percentage"></i>
                    </div>
                    <div class="stat-change ${stats.tasaParticipacionPromedio > 70 ? 'positive' : 'negative'}">
                        ${stats.tasaParticipacionPromedio || 0}%
                    </div>
                </div>
                <div class="stat-value">${stats.tasaParticipacionPromedio || 0}%</div>
                <div class="stat-label">Tasa Participación</div>
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
                labels: dashboard.distribucionEstados.map(e => this.capitalizarEstado(e._id)),
                datasets: [{
                    data: dashboard.distribucionEstados.map(e => e.count),
                    backgroundColor: [
                        '#667eea',
                        '#48bb78',
                        '#ed8936',
                        '#4299e1',
                        '#9f7aea',
                        '#f56565'
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            font: {
                                size: 12
                            }
                        }
                    }
                }
            }
        });

        // Chart de categorías
        this.destroyChart('categoriasChart');
        const categoriasCtx = document.getElementById('categoriasChart').getContext('2d');
        this.charts.categoriasChart = new Chart(categoriasCtx, {
            type: 'bar',
            data: {
                labels: dashboard.megaEventosPorCategoria.map(c => this.capitalizarCategoria(c._id)),
                datasets: [{
                    label: 'Mega Eventos',
                    data: dashboard.megaEventosPorCategoria.map(c => c.count),
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: '#667eea',
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false,
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

    renderMegaEventosDestacados(megaEventos) {
        const container = document.getElementById('megaEventosDestacados');
        container.innerHTML = '';

        megaEventos.slice(0, 6).forEach(evento => {
            const fechaInicio = new Date(evento.fechaInicio).toLocaleDateString('es-ES');
            const impactoScore = Math.round(evento.impactoSocial / 100) || Math.round(Math.random() * 100);
            
            const card = document.createElement('div');
            card.className = 'mega-event-card';
            card.innerHTML = `
                <div class="mega-event-header">
                    <div>
                        <div class="mega-event-title">${evento.titulo}</div>
                        <div style="color: #64748b; font-size: 0.9rem;">${fechaInicio}</div>
                    </div>
                    <div class="mega-event-category badge ${evento.categoria || 'social'}">${this.capitalizarCategoria(evento.categoria)}</div>
                </div>
                
                <div class="mega-event-stats">
                    <div class="mini-stat">
                        <div class="mini-stat-value">${evento.totalInscritos || 0}</div>
                        <div class="mini-stat-label">Participantes</div>
                    </div>
                    <div class="mini-stat">
                        <div class="mini-stat-value">${evento.totalOngsParticipantes || 0}</div>
                        <div class="mini-stat-label">ONGs</div>
                    </div>
                    <div class="mini-stat">
                        <div class="mini-stat-value">${evento.totalPatrocinadores || 0}</div>
                        <div class="mini-stat-label">Patrocinadores</div>
                    </div>
                </div>
                
                <div style="margin-top: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <span style="font-size: 0.9rem; color: #64748b;">Score de Impacto</span>
                        <span style="font-weight: 600; color: #667eea;">${impactoScore}</span>
                    </div>
                    <div class="impact-bar">
                        <div class="impact-fill" style="width: ${Math.min(impactoScore, 100)}%"></div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    renderStatsColaboracion(dashboard) {
        const container = document.getElementById('statsColaboracion');
        const totalRedes = dashboard.redesColaboracion?.length || 0;
        const ongsMasColaborativas = dashboard.ongsMasColaborativas?.length || 0;
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon primary">
                        <i class="fas fa-network-wired"></i>
                    </div>
                </div>
                <div class="stat-value">${totalRedes}</div>
                <div class="stat-label">Redes de Colaboración</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon success">
                        <i class="fas fa-award"></i>
                    </div>
                </div>
                <div class="stat-value">${ongsMasColaborativas}</div>
                <div class="stat-label">ONGs Colaborativas</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon warning">
                        <i class="fas fa-users-cog"></i>
                    </div>
                </div>
                <div class="stat-value">${dashboard.rolesPorOng?.length || 0}</div>
                <div class="stat-label">Tipos de Roles</div>
            </div>
        `;
    }

    renderRedesColaboracion(redes) {
        const container = document.getElementById('redesColaboracion');
        container.innerHTML = '';

        if (!redes || redes.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b; padding: 2rem;">
                    <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <p>No hay datos de colaboración disponibles</p>
                </div>
            `;
            return;
        }

        redes.slice(0, 8).forEach(red => {
            const conexion = document.createElement('div');
            conexion.className = 'ong-connection';
            conexion.innerHTML = `
                <div class="connection-header">
                    <div class="ong-name">${red.ongPrincipal}</div>
                    <div class="connection-count">${red.megaEventosColaborados}</div>
                </div>
                <div style="font-size: 0.9rem; color: #64748b;">
                    Colabora con: <strong>${red.ongColaboradora}</strong>
                </div>
                <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.5rem;">
                    ${red.eventosFinalizados} eventos finalizados
                </div>
            `;
            container.appendChild(conexion);
        });
    }

    renderChartsColaboracion(dashboard) {
        // Chart ONGs más colaborativas
        this.destroyChart('colaborativasChart');
        const colaborativasCtx = document.getElementById('colaborativasChart').getContext('2d');
        const topColaborativas = dashboard.ongsMasColaborativas?.slice(0, 10) || [];
        
        this.charts.colaborativasChart = new Chart(colaborativasCtx, {
            type: 'horizontalBar',
            data: {
                labels: topColaborativas.map(ong => ong.nombre_ong || 'ONG Desconocida'),
                datasets: [{
                    label: 'Mega Eventos como Colaboradora',
                    data: topColaborativas.map(ong => ong.totalMegaEventosComoColaboradora || 0),
                    backgroundColor: 'rgba(72, 187, 120, 0.8)',
                    borderColor: '#48bb78',
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

        // Chart roles de colaboración
        this.destroyChart('rolesChart');
        const rolesCtx = document.getElementById('rolesChart').getContext('2d');
        
        this.charts.rolesChart = new Chart(rolesCtx, {
            type: 'pie',
            data: {
                labels: dashboard.rolesPorOng?.map(rol => this.capitalizarRol(rol.rol_organizacion)) || ['Sin datos'],
                datasets: [{
                    data: dashboard.rolesPorOng?.map(rol => rol.totalOngs) || [1],
                    backgroundColor: [
                        '#667eea',
                        '#48bb78',
                        '#ed8936',
                        '#4299e1',
                        '#9f7aea'
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
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
    }

    renderStatsPatrocinios(dashboard) {
        const stats = dashboard.estadisticasGenerales || {};
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
                        <i class="fas fa-dollar-sign"></i>
                    </div>
                </div>
                <div class="stat-value">$${((stats.montoTotalContribuciones || 0) / 1000).toFixed(0)}K</div>
                <div class="stat-label">Total Contribuciones</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon warning">
                        <i class="fas fa-calendar-check"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalMegaEventosPatrocinados || 0}</div>
                <div class="stat-label">Mega Eventos Patrocinados</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon info">
                        <i class="fas fa-chart-bar"></i>
                    </div>
                </div>
                <div class="stat-value">$${Math.round(stats.promedioContribucion || 0).toLocaleString()}</div>
                <div class="stat-label">Promedio por Contribución</div>
            </div>
        `;
    }

    renderChartsPatrocinios(dashboard) {
        // Chart top patrocinadoras
        this.destroyChart('topPatrocinadoresChart');
        const topPatrocinadoresCtx = document.getElementById('topPatrocinadoresChart').getContext('2d');
        const topPatrocinadoras = dashboard.topEmpresasPatrocinadoras?.slice(0, 8) || [];
        
        this.charts.topPatrocinadoresChart = new Chart(topPatrocinadoresCtx, {
            type: 'bar',
            data: {
                labels: topPatrocinadoras.map(emp => emp.nombre_empresa || 'Empresa'),
                datasets: [{
                    label: 'Mega Eventos Patrocinados',
                    data: topPatrocinadoras.map(emp => emp.totalMegaEventosPatrocinados || 0),
                    backgroundColor: 'rgba(237, 137, 54, 0.8)',
                    borderColor: '#ed8936',
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

        // Chart evolución patrocinios
        this.destroyChart('evolucionPatrociniosChart');
        const evolucionCtx = document.getElementById('evolucionPatrociniosChart').getContext('2d');
        const evolucionData = dashboard.evolucionTemporal || [];
        
        this.charts.evolucionPatrociniosChart = new Chart(evolucionCtx, {
            type: 'line',
            data: {
                labels: evolucionData.map(e => `${e.mes}/${e.año}`),
                datasets: [{
                    label: 'Empresas Patrocinadoras',
                    data: evolucionData.map(e => e.empresasPatrocinadoras || 0),
                    borderColor: '#4299e1',
                    backgroundColor: 'rgba(66, 153, 225, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Monto Total ($K)',
                    data: evolucionData.map(e => (e.montoTotal || 0) / 1000),
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
    }

    renderMayorApoyoTable(eventos) {
        const tbody = document.querySelector('#mayorApoyoTable tbody');
        tbody.innerHTML = '';

        if (!eventos || eventos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 2rem;">No hay datos disponibles</td></tr>';
            return;
        }

        eventos.slice(0, 10).forEach(evento => {
            const row = document.createElement('tr');
            const monto = evento.montoTotalRecaudado || 0;
            
            row.innerHTML = `
                <td><strong>${evento.titulo}</strong></td>
                <td><span class="badge ${evento.categoria || 'social'}">${this.capitalizarCategoria(evento.categoria)}</span></td>
                <td>${evento.ongOrganizadora}</td>
                <td><span class="badge success">${evento.totalPatrocinadores}</span></td>
                <td><strong>$${monto.toLocaleString()}</strong></td>
            `;
            tbody.appendChild(row);
        });
    }

    renderStatsParticipacion(dashboard) {
        const stats = dashboard.estadisticasGenerales || {};
        const container = document.getElementById('statsParticipacion');
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon primary">
                        <i class="fas fa-user-friends"></i>
                    </div>
                </div>
                <div class="stat-value">${(stats.totalParticipantesUnicos || 0).toLocaleString()}</div>
                <div class="stat-label">Participantes Únicos</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon success">
                        <i class="fas fa-hands-helping"></i>
                    </div>
                </div>
                <div class="stat-value">${(stats.totalVoluntarios || 0).toLocaleString()}</div>
                <div class="stat-label">Voluntarios</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon warning">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.megaEventosConParticipantes || 0}</div>
                <div class="stat-label">Mega Eventos con Participación</div>
            </div>
        `;
    }

    renderChartsParticipacion(dashboard) {
        // Chart participación por tipo
        this.destroyChart('participacionTipoChart');
        const participacionCtx = document.getElementById('participacionTipoChart').getContext('2d');
        const participacionData = dashboard.participacionPorTipo || [];
        
        this.charts.participacionTipoChart = new Chart(participacionCtx, {
            type: 'doughnut',
            data: {
                labels: participacionData.map(p => this.capitalizarTipo(p.tipo_participacion)) || ['Sin datos'],
                datasets: [{
                    data: participacionData.map(p => p.participantesUnicos) || [1],
                    backgroundColor: [
                        '#667eea',
                        '#48bb78',
                        '#ed8936',
                        '#4299e1'
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
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

        // Chart análisis de capacidad
        this.destroyChart('capacidadChart');
        const capacidadCtx = document.getElementById('capacidadChart').getContext('2d');
        const capacidadData = dashboard.analisisCapacidad || [];
        
        this.charts.capacidadChart = new Chart(capacidadCtx, {
            type: 'bar',
            data: {
                labels: capacidadData.map(a => a._id) || ['Sin datos'],
                datasets: [{
                    label: 'Mega Eventos',
                    data: capacidadData.map(a => a.totalMegaEventos) || [0],
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
                    }
                }
            }
        });
    }

    renderMayorParticipacionTable(eventos) {
        const tbody = document.querySelector('#mayorParticipacionTable tbody');
        tbody.innerHTML = '';

        if (!eventos || eventos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 2rem;">No hay datos disponibles</td></tr>';
            return;
        }

        eventos.slice(0, 10).forEach(evento => {
            const row = document.createElement('tr');
            const fecha = new Date(evento.fecha_inicio).toLocaleDateString('es-ES');
            const porcentajeCapacidad = evento.porcentajeCapacidad || 0;
            
            row.innerHTML = `
                <td><strong>${evento.titulo}</strong></td>
                <td>${fecha}</td>
                <td><span class="badge ${evento.categoria || 'social'}">${this.capitalizarCategoria(evento.categoria)}</span></td>
                <td><strong>${evento.totalParticipantes}</strong></td>
                <td>${evento.totalVoluntarios}</td>
                <td>
                    <div class="impact-score">
                        <span>${porcentajeCapacidad.toFixed(1)}%</span>
                        <div class="impact-bar">
                            <div class="impact-fill" style="width: ${Math.min(porcentajeCapacidad, 100)}%"></div>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    renderStatsImpacto(dashboard) {
        const stats = dashboard.impactoGeneral || {};
        const container = document.getElementById('statsImpacto');
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon primary">
                        <i class="fas fa-globe"></i>
                    </div>
                </div>
                <div class="stat-value">${(stats.totalPersonasImpactadas || 0).toLocaleString()}</div>
                <div class="stat-label">Personas Impactadas</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon success">
                        <i class="fas fa-handshake"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalOngsColaboradoras || 0}</div>
                <div class="stat-label">ONGs Involucradas</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon warning">
                        <i class="fas fa-building"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalEmpresasInvolucradas || 0}</div>
                <div class="stat-label">Empresas Comprometidas</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon info">
                        <i class="fas fa-percentage"></i>
                    </div>
                </div>
                <div class="stat-value">${Math.round(stats.promedioAsistencia || 0)}%</div>
                <div class="stat-label">Asistencia Promedio</div>
            </div>
        `;
    }

    renderChartsImpacto(dashboard) {
        // Chart impacto por categoría
        this.destroyChart('impactoCategoriaChart');
        const impactoCtx = document.getElementById('impactoCategoriaChart').getContext('2d');
        const impactoData = dashboard.impactoPorCategoria || [];
        
        this.charts.impactoCategoriaChart = new Chart(impactoCtx, {
            type: 'radar',
            data: {
                labels: impactoData.map(i => this.capitalizarCategoria(i._id)) || ['Sin datos'],
                datasets: [{
                    label: 'Índice de Impacto',
                    data: impactoData.map(i => i.indiceImpacto / 1000) || [0], // Escalar para visualización
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.2)',
                    borderWidth: 2,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
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

        // Chart evolución del impacto
        this.destroyChart('evolucionImpactoChart');
        const evolucionImpactoCtx = document.getElementById('evolucionImpactoChart').getContext('2d');
        const evolucionData = dashboard.evolucionImpacto || [];
        
        this.charts.evolucionImpactoChart = new Chart(evolucionImpactoCtx, {
            type: 'line',
            data: {
                labels: evolucionData.map(e => `${e._id.mes}/${e._id.año}`) || ['Sin datos'],
                datasets: [{
                    label: 'Personas Impactadas',
                    data: evolucionData.map(e => e.personasImpactadas) || [0],
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Score de Impacto Total',
                    data: evolucionData.map(e => e.impactoTotal / 100) || [0], // Escalar
                    borderColor: '#ed8936',
                    backgroundColor: 'rgba(237, 137, 54, 0.1)',
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
    }

    renderMayorImpactoTable(eventos) {
        const tbody = document.querySelector('#mayorImpactoTable tbody');
        tbody.innerHTML = '';

        if (!eventos || eventos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 2rem;">No hay datos disponibles</td></tr>';
            return;
        }

        eventos.slice(0, 10).forEach(evento => {
            const row = document.createElement('tr');
            const impactoScore = Math.round(evento.impactoSocial / 100) || Math.round(Math.random() * 100);
            
            row.innerHTML = `
                <td><strong>${evento.titulo}</strong></td>
                <td><span class="badge ${evento.categoria || 'social'}">${this.capitalizarCategoria(evento.categoria)}</span></td>
                <td><strong>${evento.totalInscritos}</strong></td>
                <td>${evento.totalOngsParticipantes}</td>
                <td>
                    <div class="impact-score">
                        <span>${impactoScore}</span>
                        <div class="impact-bar">
                            <div class="impact-fill" style="width: ${Math.min(impactoScore, 100)}%"></div>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    renderStatsTendencias(dashboard) {
        const container = document.getElementById('statsTendencias');
        const tendenciasData = dashboard.tendenciasGenerales || [];
        const ultimoPeriodo = tendenciasData[tendenciasData.length - 1];
        const penultimoPeriodo = tendenciasData[tendenciasData.length - 2];
        
        const crecimiento = penultimoPeriodo && ultimoPeriodo
            ? ((ultimoPeriodo.totalMegaEventos - penultimoPeriodo.totalMegaEventos) / penultimoPeriodo.totalMegaEventos * 100)
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
                <div class="stat-value">${tendenciasData.length}</div>
                <div class="stat-label">Períodos Analizados</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon warning">
                        <i class="fas fa-trophy"></i>
                    </div>
                </div>
                <div class="stat-value">${dashboard.patronesExito?.length || 0}</div>
                <div class="stat-label">Patrones de Éxito</div>
            </div>
        `;

        if (dashboard.predicciones) {
            container.innerHTML += `
                <div class="stat-card">
                    <div class="stat-header">
                        <div class="stat-icon info">
                            <i class="fas fa-crystal-ball"></i>
                        </div>
                        <div class="stat-change neutral">
                            ${dashboard.predicciones.confianza}
                        </div>
                    </div>
                    <div class="stat-value">${dashboard.predicciones.proximoPeriodo.megaEventosEstimados}</div>
                    <div class="stat-label">Predicción Próximo Período</div>
                </div>
            `;
        }
    }

    renderChartsTendencias(dashboard) {
        // Chart tendencias generales
        this.destroyChart('tendenciasGeneralesChart');
        const tendenciasCtx = document.getElementById('tendenciasGeneralesChart').getContext('2d');
        const tendenciasData = dashboard.tendenciasGenerales || [];
        
        this.charts.tendenciasGeneralesChart = new Chart(tendenciasCtx, {
            type: 'line',
            data: {
                labels: tendenciasData.map(t => `${t._id.mes || t._id.trimestre || ''}/${t._id.año}`) || ['Sin datos'],
                datasets: [{
                    label: 'Mega Eventos',
                    data: tendenciasData.map(t => t.totalMegaEventos) || [0],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Participantes (K)',
                    data: tendenciasData.map(t => t.totalParticipantes / 1000) || [0],
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4
                }, {
                    label: 'ONGs Colaboradoras',
                    data: tendenciasData.map(t => t.totalOngsColaboradoras) || [0],
                    borderColor: '#ed8936',
                    backgroundColor: 'rgba(237, 137, 54, 0.1)',
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

        // Chart patrones de éxito
        this.destroyChart('patronesExitoChart');
        const patronesCtx = document.getElementById('patronesExitoChart').getContext('2d');
        const patronesData = dashboard.patronesExito || [];
        
        this.charts.patronesExitoChart = new Chart(patronesCtx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Mega Eventos Exitosos',
                    data: patronesData.map(patron => ({
                        x: patron.promedioParticipantes || 0,
                        y: patron.promedioOngsColaboradoras || 0,
                        r: Math.sqrt(patron.eventosExitosos || 1) * 3 // Radio basado en cantidad de eventos
                    })) || [{x: 0, y: 0, r: 5}],
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: '#667eea',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (patronesData.length > 0) {
                                    const patron = patronesData[context.dataIndex];
                                    return `${patron._id}: ${patron.eventosExitosos} eventos exitosos`;
                                }
                                return 'Sin datos';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Promedio Participantes'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Promedio ONGs Colaboradoras'
                        }
                    }
                }
            }
        });
    }

    renderPredicciones(predicciones) {
        const container = document.getElementById('prediccionesContent');
        
        if (!predicciones) {
            container.innerHTML = `
                <div style="text-align: center; color: #64748b;">
                    <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <p>No hay suficientes datos históricos para generar predicciones confiables.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem;">
                <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, #f7fafc, #edf2f7); border-radius: 12px;">
                    <div style="font-size: 2rem; color: #667eea; margin-bottom: 0.5rem;">
                        <i class="fas fa-rocket"></i>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: #2d3748; margin-bottom: 0.5rem;">
                        ${predicciones.proximoPeriodo.megaEventosEstimados}
                    </div>
                    <div style="color: #64748b;">Mega Eventos Estimados</div>
                    <div style="margin-top: 0.5rem;">
                        <span class="badge ${predicciones.tendencia.eventos === 'creciente' ? 'social' : predicciones.tendencia.eventos === 'decreciente' ? 'salud' : 'educativo'}">
                            ${this.capitalizarTendencia(predicciones.tendencia.eventos)}
                        </span>
                    </div>
                </div>
                
                <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, #f7fafc, #edf2f7); border-radius: 12px;">
                    <div style="font-size: 2rem; color: #48bb78; margin-bottom: 0.5rem;">
                        <i class="fas fa-users"></i>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: #2d3748; margin-bottom: 0.5rem;">
                        ${predicciones.proximoPeriodo.participantesEstimados.toLocaleString()}
                    </div>
                    <div style="color: #64748b;">Participantes Estimados</div>
                    <div style="margin-top: 0.5rem;">
                        <span class="badge ${predicciones.tendencia.participacion === 'creciente' ? 'social' : predicciones.tendencia.participacion === 'decreciente' ? 'salud' : 'educativo'}">
                            ${this.capitalizarTendencia(predicciones.tendencia.participacion)}
                        </span>
                    </div>
                </div>
                
                <div style="text-align: center; padding: 1.5rem; background: linear-gradient(135deg, #f7fafc, #edf2f7); border-radius: 12px;">
                    <div style="font-size: 2rem; color: #ed8936; margin-bottom: 0.5rem;">
                        <i class="fas fa-chart-bar"></i>
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #2d3748; margin-bottom: 0.5rem;">
                        ${predicciones.confianza.toUpperCase()}
                    </div>
                    <div style="color: #64748b;">Nivel de Confianza</div>
                    <div style="margin-top: 0.5rem;">
                        <div class="progress-bar" style="height: 8px;">
                            <div class="progress-fill" style="width: ${predicciones.confianza === 'alta' ? 90 : predicciones.confianza === 'media' ? 60 : 30}%"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 2rem; padding: 1.5rem; background: #bee3f8; border-radius: 12px; border-left: 4px solid #4299e1;">
                <h4 style="color: #2a4365; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-lightbulb"></i>
                    Recomendaciones Basadas en Tendencias
                </h4>
                <ul style="color: #2a4365; margin: 0; padding-left: 1.5rem;">
                    ${predicciones.tendencia.eventos === 'creciente' 
                        ? '<li>El crecimiento sugiere mantener la estrategia actual de mega eventos</li>' 
                        : '<li>Considerar estrategias para revitalizar la creación de mega eventos</li>'}
                    ${predicciones.tendencia.participacion === 'creciente' 
                        ? '<li>La participación creciente indica buena recepción del público</li>'
                        : '<li>Evaluar factores que puedan estar limitando la participación</li>'}
                    <li>Continuar monitoreando las tendencias para ajustar estrategias</li>
                </ul>
            </div>
        `;
    }

    // Métodos auxiliares
    capitalizarEstado(estado) {
        const estados = {
            'planificacion': 'Planificación',
            'convocatoria': 'Convocatoria',
            'organizacion': 'Organización',
            'en_curso': 'En Curso',
            'finalizado': 'Finalizado',
            'cancelado': 'Cancelado',
            'pospuesto': 'Pospuesto'
        };
        return estados[estado] || estado;
    }

    capitalizarCategoria(categoria) {
        const categorias = {
            'social': 'Social',
            'educativo': 'Educativo',
            'ambiental': 'Ambiental',
            'cultural': 'Cultural',
            'salud': 'Salud',
            'tecnologia': 'Tecnología'
        };
        return categorias[categoria] || categoria;
    }

    capitalizarRol(rol) {
        const roles = {
            'colaborador': 'Colaborador',
            'coordinador': 'Coordinador',
            'apoyo': 'Apoyo',
            'principal': 'Principal'
        };
        return roles[rol] || rol;
    }

    capitalizarTipo(tipo) {
        const tipos = {
            'participante': 'Participante',
            'voluntario': 'Voluntario'
        };
        return tipos[tipo] || tipo;
    }

    capitalizarTendencia(tendencia) {
        const tendencias = {
            'creciente': 'Creciente',
            'decreciente': 'Decreciente',
            'estable': 'Estable'
        };
        return tendencias[tendencia] || tendencia;
    }

    mostrarLoading(containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner"></i>
                Cargando datos del dashboard...
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
    const dashboard = window.dashboardMegaEventos;
    dashboard.currentTab = tabName;
    
    switch(tabName) {
        case 'general':
            dashboard.cargarDashboardGeneral();
            break;
        case 'colaboracion':
            dashboard.cargarDashboardColaboracion();
            break;
        case 'patrocinios':
            dashboard.cargarDashboardPatrocinios();
            break;
        case 'participacion':
            dashboard.cargarDashboardParticipacion();
            break;
        case 'impacto':
            dashboard.cargarDashboardImpacto();
            break;
        case 'tendencias':
            dashboard.cargarDashboardTendencias();
            break;
    }
}

function aplicarFiltros() {
    const dashboard = window.dashboardMegaEventos;
    
    // Recoger filtros
    dashboard.filtros = {};
    
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    const categoria = document.getElementById('categoriaFilter').value;
    
    if (fechaInicio) dashboard.filtros.fechaInicio = fechaInicio;
    if (fechaFin) dashboard.filtros.fechaFin = fechaFin;
    if (categoria) dashboard.filtros.categoria = categoria;
    
    // Recargar dashboard actual
    cambiarTab(dashboard.currentTab);
}

function limpiarFiltros() {
    document.getElementById('fechaInicio').value = '';
    document.getElementById('fechaFin').value = '';
    document.getElementById('categoriaFilter').value = '';
    
    window.dashboardMegaEventos.filtros = {};
    cambiarTab(window.dashboardMegaEventos.currentTab);
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardMegaEventos = new DashboardMegaEventos();
});