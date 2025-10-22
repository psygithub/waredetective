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
        document.getElementById('save-alert-config-btn').addEventListener('click', saveAlertConfig);
        document.getElementById('run-analysis-btn').addEventListener('click', runAnalysis);


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
        const alerts = await apiRequest('/api/inventory/alerts');
        displayAlerts(alerts);
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

function displayAlerts(alerts) {
    const container = document.getElementById('alertsList');
    if (!container) return; // Exit if container is not found

    if (alerts.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无库存预警</p>';
        return;
    }

    let html = `
        <div class="list-group">
    `;

    alerts.forEach(alert => {
        const details = JSON.parse(alert.details);
        let itemClass = 'list-group-item-action';
        switch (alert.alert_level) {
            case 3: itemClass += ' list-group-item-danger'; break;
            case 2: itemClass += ' list-group-item-warning'; break;
            case 1: itemClass += ' list-group-item-info'; break;
        }

        html += `
            <div class="list-group-item ${itemClass}">
                <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">${alert.sku} 在 ${alert.region_name} ${getBadgeForLevel(alert.alert_level)}</h5>
                    <small>${new Date(alert.created_at).toLocaleString()}</small>
                </div>
                <p class="mb-1">
                    库存消耗过快！在 ${details.days} 天内消耗了 ${details.qtyChange} 件 (从 ${details.startQty} 到 ${details.endQty})。
                    日均消耗率: ${(details.consumptionRate * 100).toFixed(2)}%
                </p>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

async function loadAlertConfigs() {
    const configs = await apiRequest('/api/inventory/system-configs');
    if (configs) {
        document.getElementById('alert-timespan-input').value = configs.alert_timespan || '7';
        document.getElementById('alert-threshold-input').value = configs.alert_threshold || '0.03';
        document.getElementById('alert-min-daily-consumption-input').value = configs.alert_min_daily_consumption || '5';
        document.getElementById('alert-max-daily-consumption-input').value = configs.alert_max_daily_consumption || '20';
        document.getElementById('alert-medium-threshold-multiplier-input').value = configs.alert_medium_threshold_multiplier || '1.5';
    }

    const schedules = await apiRequest('/api/schedules');
    const alertSchedule = schedules.find(s => s.name === 'Alert Analysis Schedule');
    if (alertSchedule) {
        document.getElementById('alert-cron-input').value = alertSchedule.cron;
    } else {
        document.getElementById('alert-cron-input').value = '0 3 * * *'; // 默认值
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
