class BacklogApp {
    constructor() {
        this.API_BASE = 'http://localhost:3000/api/v1';
        this.connectionId = null;
        this.selectedProject = null;
        this.projects = [];
        this.statuses = [];
        this.issueTypes = [];
        this.categories = [];
        
        this.initializeDateInputs();
    }

    initializeDateInputs() {
        const today = new Date();
        const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
        
        document.getElementById('sinceDate').value = threeMonthsAgo.toISOString().split('T')[0];
        document.getElementById('untilDate').value = today.toISOString().split('T')[0];
    }

    async apiCall(endpoint, data = {}) {
        try {
            const response = await fetch(`${this.API_BASE}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || 'API request failed');
            }
            
            return result;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    showMessage(elementId, message, type = 'error') {
        const element = document.getElementById(elementId);
        element.innerHTML = `<div class="${type}">${message}</div>`;
    }

    showStep(stepNumber) {
        document.querySelectorAll('.step').forEach(step => step.classList.add('hidden'));
        document.getElementById(`step-${stepNumber}`).classList.remove('hidden');
    }

    async connectToBacklog() {
        const spaceKey = document.getElementById('spaceKey').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();
        
        if (!spaceKey || !apiKey) {
            this.showMessage('connectionResult', 'Space KeyとAPI Keyを入力してください', 'error');
            return;
        }
        
        this.showMessage('connectionResult', '接続中...', 'loading');
        
        try {
            const result = await this.apiCall('/backlog/connect', {
                spaceKey,
                apiKey
            });
            
            this.connectionId = result.data.connectionId;
            
            this.showMessage('connectionResult', 
                `✅ ${result.data.space.name} に ${result.data.user.name} として接続しました`, 'success');
            
            await this.loadProjects();
            this.showStep(2);
        } catch (error) {
            this.showMessage('connectionResult', 
                `❌ 接続に失敗しました: ${error.message}`, 'error');
        }
    }

    async loadProjects() {
        try {
            const result = await this.apiCall('/backlog/projects', {
                connectionId: this.connectionId
            });
            
            this.projects = result.data;
            this.renderProjects();
        } catch (error) {
            console.error('Failed to load projects:', error);
        }
    }

    renderProjects() {
        const projectsList = document.getElementById('projectsList');
        
        projectsList.innerHTML = this.projects.map(project => `
            <div class="project-card" data-project-key="${project.projectKey}" 
                 onclick="app.selectProjectCard('${project.projectKey}')">
                <div class="project-name">${project.name}</div>
                <div class="project-key">${project.projectKey}</div>
            </div>
        `).join('');
    }

    selectProjectCard(projectKey) {
        document.querySelectorAll('.project-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        document.querySelector(`[data-project-key="${projectKey}"]`).classList.add('selected');
        
        this.selectedProject = this.projects.find(p => p.projectKey === projectKey);
        document.getElementById('selectProjectBtn').classList.remove('hidden');
    }

    async selectProject() {
        if (!this.selectedProject) return;
        
        try {
            await this.loadProjectConfiguration();
            this.showStep(3);
        } catch (error) {
            console.error('Failed to load project configuration:', error);
        }
    }

    async loadProjectConfiguration() {
        const projectKey = this.selectedProject.projectKey;
        
        try {
            const [statusesResult, issueTypesResult, categoriesResult] = await Promise.all([
                this.apiCall(`/backlog/projects/${projectKey}/statuses`, {
                    connectionId: this.connectionId
                }),
                this.apiCall(`/backlog/projects/${projectKey}/issue-types`, {
                    connectionId: this.connectionId
                }),
                this.apiCall(`/backlog/projects/${projectKey}/categories`, {
                    connectionId: this.connectionId
                })
            ]);
            
            this.statuses = statusesResult.data;
            this.issueTypes = issueTypesResult.data;
            this.categories = categoriesResult.data;
            
            this.renderConfiguration();
        } catch (error) {
            throw new Error(`設定の読み込みに失敗: ${error.message}`);
        }
    }

    renderConfiguration() {
        this.renderCheckboxGroup('statusesList', this.statuses, 'status');
        this.renderCheckboxGroup('changeTypesList', this.issueTypes, 'changeType');
        this.renderCheckboxGroup('changeCategoriesList', this.categories, 'changeCategory');
        this.renderCheckboxGroup('bugTypesList', this.issueTypes, 'bugType');
        this.renderCheckboxGroup('bugCategoriesList', this.categories, 'bugCategory');
    }

    renderCheckboxGroup(elementId, items, namePrefix) {
        const element = document.getElementById(elementId);
        
        element.innerHTML = items.map(item => `
            <div class="checkbox-item">
                <input type="checkbox" id="${namePrefix}_${item.id}" value="${item.id}">
                <label for="${namePrefix}_${item.id}">${item.name}</label>
            </div>
        `).join('');
    }

    getSelectedValues(namePrefix) {
        return Array.from(document.querySelectorAll(`input[id^="${namePrefix}_"]:checked`))
            .map(input => parseInt(input.value));
    }

    async calculateMetrics() {
        const completionStatusIds = this.getSelectedValues('status');
        const changeTypeIds = this.getSelectedValues('changeType');
        const changeCategoryIds = this.getSelectedValues('changeCategory');
        const bugTypeIds = this.getSelectedValues('bugType');
        const bugCategoryIds = this.getSelectedValues('bugCategory');
        const since = document.getElementById('sinceDate').value + 'T00:00:00Z';
        const until = document.getElementById('untilDate').value + 'T23:59:59Z';
        
        if (completionStatusIds.length === 0) {
            alert('完了ステータスを最低1つ選択してください');
            return;
        }
        
        if (changeTypeIds.length === 0 && changeCategoryIds.length === 0) {
            alert('変更チケットタイプまたは変更カテゴリを最低1つ選択してください');
            return;
        }
        
        try {
            const result = await this.apiCall('/metrics/all', {
                connectionId: this.connectionId,
                projectKey: this.selectedProject.projectKey,
                completionStatusIds,
                changeTypeIds,
                changeCategoryIds,
                bugTypeIds,
                bugCategoryIds,
                since,
                until
            });
            
            this.renderMetrics(result.data);
            this.showStep(4);
        } catch (error) {
            alert(`メトリクス計算に失敗しました: ${error.message}`);
        }
    }

    renderMetrics(metrics) {
        const metricsResult = document.getElementById('metricsResult');
        
        const metricsConfig = [
            {
                key: 'deploymentFrequency',
                title: 'Deployment Frequency',
                subtitle: 'デプロイ頻度',
                icon: '🚀'
            },
            {
                key: 'leadTime',
                title: 'Lead Time for Changes',
                subtitle: '変更のリードタイム',
                icon: '⏱️'
            },
            {
                key: 'meanTimeToRecovery',
                title: 'Mean Time to Recovery',
                subtitle: '平均復旧時間',
                icon: '🔧'
            },
            {
                key: 'changeFailureRate',
                title: 'Change Failure Rate',
                subtitle: '変更失敗率',
                icon: '📊'
            }
        ];
        
        metricsResult.innerHTML = metricsConfig.map(config => {
            const metric = metrics[config.key];
            return `
                <div class="metric-card">
                    <div class="metric-header">
                        <div>
                            <div class="metric-title">${config.icon} ${config.title}</div>
                            <div class="metric-subtitle">${config.subtitle}</div>
                        </div>
                        <span class="metric-level level-${metric.performanceLevel}">
                            ${metric.performanceLevel.toUpperCase()}
                        </span>
                    </div>
                    <div class="metric-value">
                        ${this.formatMetricValue(metric.value)}
                        <span class="metric-unit">${metric.unit}</span>
                    </div>
                    <div class="metric-description">
                        ${metric.description}
                    </div>
                </div>
            `;
        }).join('');
    }

    formatMetricValue(value) {
        if (typeof value === 'number') {
            return value % 1 === 0 ? value.toString() : value.toFixed(2);
        }
        return value;
    }

    resetForm() {
        this.connectionId = null;
        this.selectedProject = null;
        this.projects = [];
        this.statuses = [];
        this.issueTypes = [];
        this.categories = [];
        
        document.getElementById('spaceKey').value = '';
        document.getElementById('apiKey').value = '';
        document.getElementById('connectionResult').innerHTML = '';
        
        this.initializeDateInputs();
        this.showStep(1);
    }
}

const app = new BacklogApp();

function connectToBacklog() {
    app.connectToBacklog();
}

function selectProject() {
    app.selectProject();
}

function calculateMetrics() {
    app.calculateMetrics();
}

function resetForm() {
    app.resetForm();
}