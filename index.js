class BacklogApiService {
    constructor(spaceKey, apiKey) {
        this.spaceKey = spaceKey;
        this.apiKey = apiKey;
        this.baseURL = `https://${spaceKey}.backlog.com/api/v2`;
    }

    async apiCall(endpoint, params = {}) {
        const url = new URL(`${this.baseURL}${endpoint}`);
        url.searchParams.append('apiKey', this.apiKey);
        
        Object.keys(params).forEach(key => {
            if (key.endsWith('[]') && Array.isArray(params[key])) {
                // 配列パラメータの場合
                params[key].forEach(value => {
                    url.searchParams.append(key, value);
                });
            } else if (Array.isArray(params[key])) {
                // 通常の配列の場合は[]を付ける
                params[key].forEach(value => {
                    url.searchParams.append(`${key}[]`, value);
                });
            } else if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                url.searchParams.append(key, params[key]);
            }
        });

        console.log('Final URL:', url.toString());

        try {
            const response = await fetch(url.toString());
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', response.status, errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Full API Error:', error);
            throw new Error(`API call failed: ${error.message}`);
        }
    }

    async getUserInfo() {
        return await this.apiCall('/users/myself');
    }

    async getSpaceInfo() {
        return await this.apiCall('/space');
    }

    async getProjects() {
        return await this.apiCall('/projects');
    }

    async getProjectByKey(projectKey) {
        return await this.apiCall(`/projects/${projectKey}`);
    }

    async getIssueTypes(projectId) {
        return await this.apiCall(`/projects/${projectId}/issueTypes`);
    }

    async getStatuses(projectId) {
        return await this.apiCall(`/projects/${projectId}/statuses`);
    }

    async getCategories(projectId) {
        return await this.apiCall(`/projects/${projectId}/categories`);
    }

    async getIssues(params = {}) {
        return await this.apiCall('/issues', params);
    }

    async getAllIssues(projectId, filters = {}) {
        const allIssues = [];
        let offset = 0;
        const count = 100;
        
        while (true) {
            const params = {
                projectId: [projectId],
                count,
                offset,
                ...filters
            };

            // statusIdの処理を修正
            if (filters.statusId) {
                delete params.statusId;
                params['statusId[]'] = Array.isArray(filters.statusId) ? filters.statusId : [filters.statusId];
            }

            // issueTypeIdの処理を修正
            if (filters.issueTypeId) {
                delete params.issueTypeId;
                params['issueTypeId[]'] = Array.isArray(filters.issueTypeId) ? filters.issueTypeId : [filters.issueTypeId];
            }

            // categoryIdの処理を修正
            if (filters.categoryId) {
                delete params.categoryId;
                params['categoryId[]'] = Array.isArray(filters.categoryId) ? filters.categoryId : [filters.categoryId];
            }

            console.log('API Call params:', params);
            
            try {
                const issues = await this.getIssues(params);
                
                if (issues.length === 0) {
                    break;
                }
                
                allIssues.push(...issues);
                offset += count;
                
                if (issues.length < count) {
                    break;
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('Error fetching issues:', error);
                throw error;
            }
        }
        
        return allIssues;
    }
}

class FourKeysMetricsService {
    constructor(backlogApi, project) {
        this.backlogApi = backlogApi;
        this.project = project;
    }

    async calculateAllMetrics(config) {
        const {
            completionStatusIds = [],
            changeTypeIds = [],
            changeCategoryIds = [],
            bugTypeIds = [],
            bugCategoryIds = [],
            since,
            until
        } = config;

        const [
            deploymentFrequency,
            leadTime,
            mttr,
            changeFailureRate
        ] = await Promise.all([
            this.calculateDeploymentFrequency(completionStatusIds, since, until),
            this.calculateLeadTime(changeTypeIds, changeCategoryIds, completionStatusIds, since, until),
            this.calculateMTTR(bugTypeIds, bugCategoryIds, since, until),
            this.calculateChangeFailureRate(changeTypeIds, changeCategoryIds, bugTypeIds, bugCategoryIds, since, until)
        ]);

        return {
            deploymentFrequency,
            leadTime,
            meanTimeToRecovery: mttr,
            changeFailureRate,
            calculatedAt: new Date().toISOString(),
            period: { since, until },
            project: {
                id: this.project.id,
                key: this.project.projectKey,
                name: this.project.name
            }
        };
    }

    async calculateDeploymentFrequency(completionStatusIds, since, until) {
        try {
            if (!completionStatusIds || completionStatusIds.length === 0) {
                return {
                    value: 0,
                    unit: 'deployments per day',
                    performanceLevel: 'low',
                    description: 'No completion statuses configured'
                };
            }

            const issues = await this.backlogApi.getAllIssues(this.project.id, {
                statusId: completionStatusIds,
                updatedSince: since,
                updatedUntil: until
            });

            const deploymentCount = issues.length;
            const periodDays = this.calculatePeriodInDays(since, until);
            const deploymentsPerDay = periodDays > 0 ? deploymentCount / periodDays : 0;

            return {
                value: deploymentsPerDay,
                count: deploymentCount,
                periodDays,
                unit: 'deployments per day',
                performanceLevel: this.getDeploymentFrequencyLevel(deploymentsPerDay),
                description: `${deploymentCount} deployments in ${periodDays} days`
            };
        } catch (error) {
            throw new Error(`Failed to calculate deployment frequency: ${error.message}`);
        }
    }

    async calculateLeadTime(changeTypeIds, changeCategoryIds, completionStatusIds, since, until) {
        try {
            if ((!changeTypeIds || changeTypeIds.length === 0) && 
                (!changeCategoryIds || changeCategoryIds.length === 0)) {
                return {
                    value: 0,
                    unit: 'days',
                    performanceLevel: 'low',
                    description: 'No change types or categories configured'
                };
            }

            const filters = {
                updatedSince: since,
                updatedUntil: until
            };

            if (changeTypeIds && changeTypeIds.length > 0) {
                filters.issueTypeId = changeTypeIds;
            }
            
            if (changeCategoryIds && changeCategoryIds.length > 0) {
                filters.categoryId = changeCategoryIds;
            }

            if (completionStatusIds && completionStatusIds.length > 0) {
                filters.statusId = completionStatusIds;
            }

            const issues = await this.backlogApi.getAllIssues(this.project.id, filters);

            if (issues.length === 0) {
                return {
                    value: 0,
                    unit: 'days',
                    performanceLevel: 'low',
                    description: 'No completed change issues found'
                };
            }

            const leadTimes = issues
                .filter(issue => issue.created && issue.updated)
                .map(issue => {
                    const created = new Date(issue.created);
                    const completed = new Date(issue.updated);
                    return (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
                })
                .filter(days => days >= 0);

            if (leadTimes.length === 0) {
                return {
                    value: 0,
                    unit: 'days',
                    performanceLevel: 'low',
                    description: 'No valid lead times calculated'
                };
            }

            const averageLeadTime = leadTimes.reduce((sum, time) => sum + time, 0) / leadTimes.length;

            return {
                value: Math.round(averageLeadTime * 100) / 100,
                count: leadTimes.length,
                unit: 'days',
                performanceLevel: this.getLeadTimeLevel(averageLeadTime),
                description: `Average of ${leadTimes.length} completed changes`
            };
        } catch (error) {
            throw new Error(`Failed to calculate lead time: ${error.message}`);
        }
    }

    async calculateMTTR(bugTypeIds, bugCategoryIds, since, until) {
        try {
            if ((!bugTypeIds || bugTypeIds.length === 0) && 
                (!bugCategoryIds || bugCategoryIds.length === 0)) {
                return {
                    value: 0,
                    unit: 'hours',
                    performanceLevel: 'low',
                    description: 'No bug types or categories configured'
                };
            }

            const filters = {
                updatedSince: since,
                updatedUntil: until
            };

            if (bugTypeIds && bugTypeIds.length > 0) {
                filters.issueTypeId = bugTypeIds;
            }
            
            if (bugCategoryIds && bugCategoryIds.length > 0) {
                filters.categoryId = bugCategoryIds;
            }

            const issues = await this.backlogApi.getAllIssues(this.project.id, filters);

            const resolvedBugs = issues.filter(issue => 
                issue.status && 
                (issue.status.name.includes('完了') || 
                 issue.status.name.includes('解決') || 
                 issue.status.name.includes('Resolved') || 
                 issue.status.name.includes('Done'))
            );

            if (resolvedBugs.length === 0) {
                return {
                    value: 0,
                    unit: 'hours',
                    performanceLevel: 'low',
                    description: 'No resolved bugs found'
                };
            }

            const recoveryTimes = resolvedBugs
                .filter(issue => issue.created && issue.updated)
                .map(issue => {
                    const created = new Date(issue.created);
                    const resolved = new Date(issue.updated);
                    return (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
                })
                .filter(hours => hours >= 0);

            if (recoveryTimes.length === 0) {
                return {
                    value: 0,
                    unit: 'hours',
                    performanceLevel: 'low',
                    description: 'No valid recovery times calculated'
                };
            }

            const averageMTTR = recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length;

            return {
                value: Math.round(averageMTTR * 100) / 100,
                count: recoveryTimes.length,
                unit: 'hours',
                performanceLevel: this.getMTTRLevel(averageMTTR),
                description: `Average of ${recoveryTimes.length} resolved bugs`
            };
        } catch (error) {
            throw new Error(`Failed to calculate MTTR: ${error.message}`);
        }
    }

    async calculateChangeFailureRate(changeTypeIds, changeCategoryIds, bugTypeIds, bugCategoryIds, since, until) {
        try {
            if ((!changeTypeIds || changeTypeIds.length === 0) && 
                (!changeCategoryIds || changeCategoryIds.length === 0)) {
                return {
                    value: 0,
                    unit: '%',
                    performanceLevel: 'elite',
                    description: 'No change types or categories configured'
                };
            }

            if ((!bugTypeIds || bugTypeIds.length === 0) && 
                (!bugCategoryIds || bugCategoryIds.length === 0)) {
                return {
                    value: 0,
                    unit: '%',
                    performanceLevel: 'elite',
                    description: 'No bug types or categories configured'
                };
            }

            const changeFilters = {
                createdSince: since,
                createdUntil: until
            };

            if (changeTypeIds && changeTypeIds.length > 0) {
                changeFilters.issueTypeId = changeTypeIds;
            }
            
            if (changeCategoryIds && changeCategoryIds.length > 0) {
                changeFilters.categoryId = changeCategoryIds;
            }

            const bugFilters = {
                createdSince: since,
                createdUntil: until
            };

            if (bugTypeIds && bugTypeIds.length > 0) {
                bugFilters.issueTypeId = bugTypeIds;
            }
            
            if (bugCategoryIds && bugCategoryIds.length > 0) {
                bugFilters.categoryId = bugCategoryIds;
            }

            const [changes, bugs] = await Promise.all([
                this.backlogApi.getAllIssues(this.project.id, changeFilters),
                this.backlogApi.getAllIssues(this.project.id, bugFilters)
            ]);

            const changeCount = changes.length;
            const bugCount = bugs.length;

            if (changeCount === 0) {
                return {
                    value: 0,
                    changeCount: 0,
                    bugCount: bugCount,
                    unit: '%',
                    performanceLevel: 'elite',
                    description: 'No changes found in the period'
                };
            }

            const failureRate = (bugCount / changeCount) * 100;

            return {
                value: Math.round(failureRate * 100) / 100,
                changeCount,
                bugCount,
                unit: '%',
                performanceLevel: this.getChangeFailureRateLevel(failureRate),
                description: `${bugCount} bugs out of ${changeCount} changes`
            };
        } catch (error) {
            throw new Error(`Failed to calculate change failure rate: ${error.message}`);
        }
    }

    calculatePeriodInDays(since, until) {
        if (!since || !until) {
            return 0;
        }
        
        const start = new Date(since + 'T00:00:00');
        const end = new Date(until + 'T23:59:59');
        return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }

    getDeploymentFrequencyLevel(deploymentsPerDay) {
        if (deploymentsPerDay >= 1) return 'elite';
        if (deploymentsPerDay >= 0.2) return 'high';
        if (deploymentsPerDay >= 0.067) return 'medium';
        return 'low';
    }

    getLeadTimeLevel(days) {
        if (days <= 1) return 'elite';
        if (days <= 7) return 'high';
        if (days <= 30) return 'medium';
        return 'low';
    }

    getMTTRLevel(hours) {
        if (hours <= 1) return 'elite';
        if (hours <= 24) return 'high';
        if (hours <= 168) return 'medium';
        return 'low';
    }

    getChangeFailureRateLevel(percentage) {
        if (percentage <= 5) return 'elite';
        if (percentage <= 10) return 'high';
        if (percentage <= 15) return 'medium';
        return 'low';
    }
}

class BacklogApp {
    constructor() {
        this.backlogApi = null;
        this.selectedProject = null;
        this.projects = [];
        this.statuses = [];
        this.issueTypes = [];
        this.categories = [];
        
        this.initializeDateInputs();
    }

    initializeDateInputs() {
        const today = new Date();
        const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
        
        document.getElementById('sinceDate').value = lastYear.toISOString().split('T')[0];
        document.getElementById('untilDate').value = today.toISOString().split('T')[0];
    }

    showMessage(elementId, message, type = 'error') {
        const element = document.getElementById(elementId);
        element.innerHTML = `<div class="${type}">${message}</div>`;
    }

    showStep(stepNumber) {
        document.querySelectorAll('.main-content .step').forEach(step => step.classList.add('hidden'));
        document.getElementById(`step-${stepNumber}`).classList.remove('hidden');
        
        // Update sidebar step states
        this.updateSidebarSteps(stepNumber);
    }

    updateSidebarSteps(currentStep) {
        for (let i = 1; i <= 3; i++) {
            const sidebarStep = document.getElementById(`sidebar-step-${i}`);
            sidebarStep.classList.remove('active', 'completed', 'disabled');
            
            if (i < currentStep) {
                sidebarStep.classList.add('completed');
            } else if (i === currentStep) {
                sidebarStep.classList.add('active');
            } else {
                sidebarStep.classList.add('disabled');
            }
        }
    }

    canGoToStep(stepNumber) {
        switch (stepNumber) {
            case 1:
                return true; // いつでもステップ1には戻れる
            case 2:
                return this.backlogApi !== null; // Backlog接続が完了していれば
            case 3:
                return this.backlogApi !== null && this.selectedProject !== null; // プロジェクト選択まで完了していれば
            default:
                return false;
        }
    }

    goToStep(stepNumber) {
        if (!this.canGoToStep(stepNumber)) {
            return; // 無効なステップには移動しない
        }
        
        this.showStep(stepNumber);
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
            this.backlogApi = new BacklogApiService(spaceKey, apiKey);
            
            const [userInfo, spaceInfo] = await Promise.all([
                this.backlogApi.getUserInfo(),
                this.backlogApi.getSpaceInfo()
            ]);
            
            this.showMessage('connectionResult', 
                `✅ ${spaceInfo.name} に ${userInfo.name} として接続しました`, 'success');
            
            // Update sidebar
            document.getElementById('connectionStatus').innerHTML = `${spaceInfo.name}<br><small>${userInfo.name}</small>`;
            
            await this.loadProjects();
            this.showStep(2);
        } catch (error) {
            this.showMessage('connectionResult', 
                `❌ 接続に失敗しました: ${error.message}`, 'error');
        }
    }

    async loadProjects() {
        try {
            this.projects = await this.backlogApi.getProjects();
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
        
        // Update sidebar
        document.getElementById('selectedProjectDisplay').innerHTML = `
            <div class="selected-project-name">${this.selectedProject.name}</div>
            <div class="selected-project-key">${this.selectedProject.projectKey}</div>
        `;
    }

    async selectProject() {
        if (!this.selectedProject) return;
        
        try {
            await this.loadProjectConfiguration();
            
            // Update sidebar
            const since = document.getElementById('sinceDate').value;
            const until = document.getElementById('untilDate').value;
            document.getElementById('configStatus').innerHTML = `期間: ${since} ～ ${until}`;
            
            this.showStep(3);
        } catch (error) {
            console.error('Failed to load project configuration:', error);
        }
    }

    async loadProjectConfiguration() {
        try {
            const [statuses, issueTypes, categories] = await Promise.all([
                this.backlogApi.getStatuses(this.selectedProject.id),
                this.backlogApi.getIssueTypes(this.selectedProject.id),
                this.backlogApi.getCategories(this.selectedProject.id)
            ]);
            
            this.statuses = statuses;
            this.issueTypes = issueTypes;
            this.categories = categories;
            
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
        
        // Reset radio button states
        document.querySelectorAll('input[name="changeBy"]').forEach(input => input.checked = false);
        document.querySelectorAll('input[name="bugBy"]').forEach(input => input.checked = false);
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
        
        // 選択された方式に応じてIDを取得
        const changeBy = document.querySelector('input[name="changeBy"]:checked')?.value;
        const bugBy = document.querySelector('input[name="bugBy"]:checked')?.value;
        
        let changeTypeIds = [];
        let changeCategoryIds = [];
        let bugTypeIds = [];
        let bugCategoryIds = [];
        
        if (changeBy === 'type') {
            changeTypeIds = this.getSelectedValues('changeType');
        } else if (changeBy === 'category') {
            changeCategoryIds = this.getSelectedValues('changeCategory');
        }
        
        if (bugBy === 'type') {
            bugTypeIds = this.getSelectedValues('bugType');
        } else if (bugBy === 'category') {
            bugCategoryIds = this.getSelectedValues('bugCategory');
        }
        
        const since = document.getElementById('sinceDate').value;
        const until = document.getElementById('untilDate').value;
        
        // バリデーション
        if (completionStatusIds.length === 0) {
            alert('完了ステータスを最低1つ選択してください');
            return;
        }
        
        if (!changeBy) {
            alert('変更チケット設定でタイプまたはカテゴリを選択してください');
            return;
        }
        
        if (changeBy === 'type' && changeTypeIds.length === 0) {
            alert('変更チケットタイプを最低1つ選択してください');
            return;
        }
        
        if (changeBy === 'category' && changeCategoryIds.length === 0) {
            alert('変更カテゴリを最低1つ選択してください');
            return;
        }
        
        try {
            const metricsService = new FourKeysMetricsService(this.backlogApi, this.selectedProject);
            
            const metrics = await metricsService.calculateAllMetrics({
                completionStatusIds,
                changeTypeIds,
                changeCategoryIds,
                bugTypeIds,
                bugCategoryIds,
                since,
                until
            });
            
            this.renderMetrics(metrics);
            this.showStep(4);
        } catch (error) {
            console.error('Metrics calculation error:', error);
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
        this.backlogApi = null;
        this.selectedProject = null;
        this.projects = [];
        this.statuses = [];
        this.issueTypes = [];
        this.categories = [];
        
        document.getElementById('spaceKey').value = '';
        document.getElementById('apiKey').value = '';
        document.getElementById('connectionResult').innerHTML = '';
        
        // Reset sidebar
        document.getElementById('connectionStatus').innerHTML = '未接続';
        document.getElementById('selectedProjectDisplay').innerHTML = '未選択';
        document.getElementById('configStatus').innerHTML = '未設定';
        
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

function goToStep(stepNumber) {
    app.goToStep(stepNumber);
}

function toggleChangeSettings() {
    const changeBy = document.querySelector('input[name="changeBy"]:checked')?.value;
    
    // 全て非表示にする
    document.getElementById('changeSelectionLabel').classList.add('hidden');
    document.getElementById('changeTypesList').classList.add('hidden');
    document.getElementById('changeCategoriesList').classList.add('hidden');
    
    if (changeBy === 'type') {
        document.getElementById('changeSelectionLabel').textContent = '変更に該当するチケットタイプを選択してください：';
        document.getElementById('changeSelectionLabel').classList.remove('hidden');
        document.getElementById('changeTypesList').classList.remove('hidden');
    } else if (changeBy === 'category') {
        document.getElementById('changeSelectionLabel').textContent = '変更に該当するカテゴリを選択してください：';
        document.getElementById('changeSelectionLabel').classList.remove('hidden');
        document.getElementById('changeCategoriesList').classList.remove('hidden');
    }
}

function toggleBugSettings() {
    const bugBy = document.querySelector('input[name="bugBy"]:checked')?.value;
    
    // 全て非表示にする
    document.getElementById('bugSelectionLabel').classList.add('hidden');
    document.getElementById('bugTypesList').classList.add('hidden');
    document.getElementById('bugCategoriesList').classList.add('hidden');
    
    if (bugBy === 'type') {
        document.getElementById('bugSelectionLabel').textContent = 'バグ・障害に該当するチケットタイプを選択してください：';
        document.getElementById('bugSelectionLabel').classList.remove('hidden');
        document.getElementById('bugTypesList').classList.remove('hidden');
    } else if (bugBy === 'category') {
        document.getElementById('bugSelectionLabel').textContent = 'バグ・障害に該当するカテゴリを選択してください：';
        document.getElementById('bugSelectionLabel').classList.remove('hidden');
        document.getElementById('bugCategoriesList').classList.remove('hidden');
    }
}