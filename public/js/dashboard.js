// 避免重复加载脚本时出错
if (typeof window.dashboardScriptLoaded === 'undefined') {
    var allAlerts = [];
    var currentAlertsPage = 1;
    var alertsPerPage = 50;
    window.dashboardScriptLoaded = true;
}

window.initializeSection = async () => {
    try {
        // 加载统计数据
        const [configsRes, schedulesRes, resultsRes, usersRes] = await Promise.all([
            apiRequest('/api/configs'),
            apiRequest('/api/schedules'),
            apiRequest('/api/results?limit=10'),
            (currentUser.role === 'admin' || currentUser.role === 'super_admin') ? apiRequest('/api/users') : Promise.resolve([])
        ]);

        // 更新统计卡片
        const totalConfigsEl = document.getElementById('totalConfigs');
        if (totalConfigsEl) totalConfigsEl.textContent = configsRes.length;

        const activeSchedulesEl = document.getElementById('activeSchedules');
        if (activeSchedulesEl) activeSchedulesEl.textContent = schedulesRes.filter(s => s.isActive).length;

        // 计算今日结果
        const today = new Date().toDateString();
        const todayResults = resultsRes.filter(r => new Date(r.createdAt).toDateString() === today);
        const todayResultsEl = document.getElementById('todayResults');
        if (todayResultsEl) todayResultsEl.textContent = todayResults.length;

        const totalUsersEl = document.getElementById('totalUsers');
        if (totalUsersEl) {
            if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
                totalUsersEl.textContent = usersRes.length;
            } else {
                totalUsersEl.textContent = '-';
            }
        }

        // 加载库存预警
        loadAlerts();
        // 加载预警配置
        loadAlertConfigs();

        // 绑定预警配置事件
        const saveBtn = document.getElementById('save-alert-config-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveAlertConfig);
        }
        const runBtn = document.getElementById('run-analysis-btn');
        if (runBtn) {
            runBtn.addEventListener('click', runAnalysis);
        }

    } catch (error) {
        console.error('加载仪表板数据失败:', error);
    }
};

async function loadAlerts() {
    const container = document.getElementById('alertsList');
    if (!container) {
        console.error('Dashboard alerts container #alertsList not found in the DOM.');
        return;
    }
    try {
        allAlerts = await apiRequest('/api/inventory/alerts');
        currentAlertsPage = 1;
        displayAlerts(currentAlertsPage);
    } catch (error) {
        console.error('加载预警失败:', error);
        container.innerHTML = '<p class="text-danger">加载预警失败</p>';
    }
}

function getBadgeForLevel(level) {
    switch (level) {
        case 3: return '<span class="badge bg-danger ms-2">高危</span>';
        case 2: return '<span class="badge bg-warning ms-2">中危</span>';
        case 1: return '<span class="badge bg-info ms-2">低危</span>';
        default: return '';
    }
}

function displayAlerts(page) {
    currentAlertsPage = page;
    const container = document.getElementById('alertsList');
    if (!container) return;

    if (allAlerts.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无库存预警</p>';
        document.getElementById('alerts-pagination').innerHTML = '';
        return;
    }

    const start = (page - 1) * alertsPerPage;
    const end = start + alertsPerPage;
    const paginatedAlerts = allAlerts.slice(start, end);

    let html = `<div class="list-group">`;

    paginatedAlerts.forEach(alert => {
        const details = JSON.parse(alert.details);
        let itemClass = 'list-group-item-action';
        switch (alert.alert_level) {
            case 3: itemClass += ' list-group-item-danger'; break;
            case 2: itemClass += ' list-group-item-warning'; break;
            case 1: itemClass += ' list-group-item-info'; break;
        }

        html += `
            <div class="list-group-item ${itemClass} d-flex justify-content-between align-items-center">
                <div>
                    <strong class="mb-1">${alert.sku}</strong> 在 ${alert.region_name} ${getBadgeForLevel(alert.alert_level)}
                    <span class="ms-3">
                        (${details.days}天内消耗 ${details.qtyChange}件, 
                        日均消耗率: ${(details.consumptionRate * 100).toFixed(2)}%)
                    </span>
                </div>
                <small>${new Date(alert.created_at).toLocaleString()}</small>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
    renderAlertsPagination();
}

async function loadAlertConfigs() {
    try {
        const configs = await apiRequest('/api/inventory/system-configs');
        if (configs) {
            const alertTimespanInput = document.getElementById('alert-timespan-input');
            if (alertTimespanInput) alertTimespanInput.value = configs.alert_timespan || '7';

            const alertThresholdInput = document.getElementById('alert-threshold-input');
            if (alertThresholdInput) alertThresholdInput.value = configs.alert_threshold || '0.03';

            const alertMinDailyConsumptionInput = document.getElementById('alert-min-daily-consumption-input');
            if (alertMinDailyConsumptionInput) alertMinDailyConsumptionInput.value = configs.alert_min_daily_consumption || '5';

            const alertMaxDailyConsumptionInput = document.getElementById('alert-max-daily-consumption-input');
            if (alertMaxDailyConsumptionInput) alertMaxDailyConsumptionInput.value = configs.alert_max_daily_consumption || '20';

            const alertMediumThresholdMultiplierInput = document.getElementById('alert-medium-threshold-multiplier-input');
            if (alertMediumThresholdMultiplierInput) alertMediumThresholdMultiplierInput.value = configs.alert_medium_threshold_multiplier || '1.5';
        }

        const schedules = await apiRequest('/api/schedules');
        const alertSchedule = schedules.find(s => s.name === 'Alert Analysis Schedule');
        const alertCronInput = document.getElementById('alert-cron-input');
        if (alertCronInput) {
            if (alertSchedule) {
                alertCronInput.value = alertSchedule.cron;
            } else {
                alertCronInput.value = '0 3 * * *'; // 默认值
            }
        }
    } catch (error) {
        console.error('加载预警配置失败:', error);
    }
}

async function saveAlertConfig() {
    // 保存预警参数
    const configs = {
        alert_timespan: document.getElementById('alert-timespan-input').value,
        alert_threshold: document.getElementById('alert-threshold-input').value,
        alert_min_daily_consumption: document.getElementById('alert-min-daily-consumption-input').value,
        alert_max_daily_consumption: document.getElementById('alert-max-daily-consumption-input').value,
        alert_medium_threshold_multiplier: document.getElementById('alert-medium-threshold-multiplier-input').value,
    };
    await apiRequest('/api/inventory/system-configs', 'POST', { configs });

    // 保存定时任务
    const cron = document.getElementById('alert-cron-input').value.trim();
    if (!cron) {
        alert('请输入预警分析的 Cron 表达式');
        return;
    }

    const schedules = await apiRequest('/api/schedules');
    const alertSchedule = schedules.find(s => s.name === 'Alert Analysis Schedule');
    
    const scheduleData = {
        name: 'Alert Analysis Schedule',
        cron: cron,
        task_type: 'run_analysis', // 指定任务类型
        isActive: true
    };

    try {
        if (alertSchedule) {
            await apiRequest(`/api/schedules/${alertSchedule.id}`, 'PUT', scheduleData);
        } else {
            await apiRequest('/api/schedules', 'POST', scheduleData);
        }
        alert('预警配置已保存');
    } catch (error) {
        alert('保存定时任务失败: ' + error.message);
    }
}

function renderAlertsPagination() {
    const paginationContainer = document.getElementById('alerts-pagination');
    const totalPages = Math.ceil(allAlerts.length / alertsPerPage);
    paginationContainer.innerHTML = '';

    if (totalPages <= 1) return;

    let paginationHTML = `<ul class="pagination">`;

    const prevDisabled = currentAlertsPage === 1 ? 'disabled' : '';
    paginationHTML += `<li class="page-item ${prevDisabled}"><a class="page-link" href="#" onclick="event.preventDefault(); displayAlerts(${currentAlertsPage - 1})">上一页</a></li>`;

    for (let i = 1; i <= totalPages; i++) {
        const activeClass = i === currentAlertsPage ? 'active' : '';
        paginationHTML += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="event.preventDefault(); displayAlerts(${i})">${i}</a></li>`;
    }

    const nextDisabled = currentAlertsPage === totalPages ? 'disabled' : '';
    paginationHTML += `<li class="page-item ${nextDisabled}"><a class="page-link" href="#" onclick="event.preventDefault(); displayAlerts(${currentAlertsPage + 1})">下一页</a></li>`;

    paginationHTML += `</ul>`;
    paginationContainer.innerHTML = paginationHTML;
}

async function runAnalysis() {
    if (!confirm('立即执行一次库存分析吗？这可能需要一些时间。')) {
        return;
    }
    try {
        const result = await apiRequest('/api/inventory/run-analysis', 'POST');
        alert(result.message);
        loadAlerts(); // 刷新预警列表
    } catch (error) {
        alert('执行分析失败: ' + error.message);
    }
}
