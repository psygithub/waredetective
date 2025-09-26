window.initializeSection = async () => {
    await loadConfigs();
    await loadSchedules();
    await loadConfigsForSelect();
    setupForms();
};

async function loadConfigs() {
    try {
        const configs = await apiRequest('/api/configs');
        displayConfigs(configs);
    } catch (error) {
        console.error('加载配置失败:', error);
        document.getElementById('configsList').innerHTML = '<p class="text-danger">加载配置失败</p>';
    }
}

function displayConfigs(configs) {
    const container = document.getElementById('configsList');

    if (configs.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无配置</p>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>名称</th>
                        <th>SKU数量</th>
                        <th>地区数量</th>
                        <th>创建时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
    `;

    configs.forEach(config => {
        let skusArray = [];
        try {
            skusArray = JSON.parse(config.skus);
        } catch (error) {
            console.error("SKU数据解析失败:", error);
        }

        let regionsArray = [];
        try {
            regionsArray = JSON.parse(config.regions);
        } catch (error) {
            console.error("REGION数据解析失败:", error);
        }

        const skuCount = skusArray.length;
        const regionCount = regionsArray.length;

        html += `
            <tr>
                <td>
                    <strong>${config.name || '未命名'}</strong>
                    ${config.description ? `<br><small class="text-muted">${config.description}</small>` : ''}
                </td>
                <td>${skuCount}</td>
                <td>${regionCount}</td>
                <td>${new Date(config.createdAt).toLocaleString()}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editConfig(${config.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteConfig(${config.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function showConfigModal(configId = null) {
    const modal = new bootstrap.Modal(document.getElementById('configModal'));

    if (configId) {
        loadConfigForEdit(configId);
    } else {
        document.getElementById('configForm').reset();
        document.getElementById('configId').value = '';
    }

    modal.show();
}

async function loadConfigForEdit(configId) {
  try {
        const config = await apiRequest(`/api/configs/${configId}`);
        
        if (!config) {
            throw new Error('未找到配置');
        }

        document.getElementById('configId').value = config.id;
        document.getElementById('configName').value = config.name || '';
        document.getElementById('configSkus').value = config.skus || '';
        document.getElementById('configRegions').value = config.regions || '';
        document.getElementById('configDescription').value = config.description || '';

    } catch (error) {
        console.error('加载配置失败:', error);
        throw error;
    }
}

async function saveConfig() {
    const configId = document.getElementById('configId').value;
    const name = document.getElementById('configName').value.trim();
    const skusText = document.getElementById('configSkus').value.trim();
    const regionsText = document.getElementById('configRegions').value.trim();
    const description = document.getElementById('configDescription').value.trim();

    if (!name || !skusText) {
        alert('请填写配置名称和SKU列表');
        return;
    }

    const skus = skusText.split('\n').map(s => s.trim()).filter(s => s);
    const regions = regionsText ? regionsText.split('\n').map(r => r.trim()).filter(r => r) : [];

    const configData = { name, skus, regions, description };

    try {
        if (configId) {
            await apiRequest(`/api/configs/${configId}`, 'PUT', configData);
        } else {
            await apiRequest('/api/configs', 'POST', configData);
        }

        bootstrap.Modal.getInstance(document.getElementById('configModal')).hide();
        loadConfigs();
        loadConfigsForSelect();

    } catch (error) {
        alert('保存配置失败: ' + error.message);
    }
}

function editConfig(configId) {
    showConfigModal(configId);
}

async function deleteConfig(configId) {
    if (!confirm('确定要删除这个配置吗？')) return;

    try {
        await apiRequest(`/api/configs/${configId}`, 'DELETE');
        loadConfigs();
        loadConfigsForSelect();
    } catch (error) {
        alert('删除配置失败: ' + error.message);
    }
}

async function loadSchedules() {
    try {
        const schedules = await apiRequest('/api/schedules');
        displaySchedules(schedules);
    } catch (error) {
        console.error('加载定时任务失败:', error);
        document.getElementById('schedulesList').innerHTML = '<p class="text-danger">加载定时任务失败</p>';
    }
}

function displaySchedules(schedules) {
    const container = document.getElementById('schedulesList');

    if (schedules.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无定时任务</p>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>名称</th>
                        <th>Cron表达式</th>
                        <th>状态</th>
                        <th>创建时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
    `;

    schedules.forEach(schedule => {
        html += `
            <tr>
                <td><strong>${schedule.name}</strong></td>
                <td><code>${schedule.cron}</code></td>
                <td>
                    <span class="badge bg-${schedule.isActive ? 'success' : 'secondary'}">
                        ${schedule.isActive ? '启用' : '禁用'}
                    </span>
                </td>
                <td>${new Date(schedule.createdAt).toLocaleString()}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editSchedule(${schedule.id})">
                        <i class="fas fa-edit"></i> 编辑
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteSchedule(${schedule.id})">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function showScheduleModal(scheduleId = null) {
    // 确保先加载配置到选择框
    loadConfigsForSelect().then(() => {
        const modalElement = document.getElementById('scheduleModal');
        
        if (!modalElement) {
            console.error('定时任务模态框元素不存在');
            return;
        }

        const modal = new bootstrap.Modal(modalElement);
        
        if (scheduleId) {
            // 编辑模式
            loadScheduleForEdit(scheduleId).then(() => {
                modal.show();
            }).catch(error => {
                console.error('加载定时任务失败:', error);
                alert('加载定时任务失败: ' + error.message);
            });
        } else {
            // 新建模式
            document.getElementById('scheduleForm').reset();
            document.getElementById('scheduleId').value = '';
            document.getElementById('scheduleActive').checked = true;
            modal.show();
        }
    }).catch(error => {
        console.error('加载配置失败:', error);
        alert('加载配置失败: ' + error.message);
    });
}

async function loadScheduleForEdit(scheduleId) {
    try {
        const schedule = await apiRequest(`/api/schedules/${scheduleId}`);

        document.getElementById('scheduleId').value = schedule.id;
        document.getElementById('scheduleName').value = schedule.name || '';
        document.getElementById('scheduleConfigId').value = schedule.configId || '';
        document.getElementById('scheduleCron').value = schedule.cron || '';
        document.getElementById('scheduleActive').checked = schedule.isActive;

    } catch (error) {
        alert('加载定时任务失败: ' + error.message);
    }
}

async function saveSchedule() {
    const scheduleId = document.getElementById('scheduleId').value;
    const name = document.getElementById('scheduleName').value.trim();
    const configId = document.getElementById('scheduleConfigId').value;
    const cronExpression = document.getElementById('scheduleCron').value.trim();
    const isActive = document.getElementById('scheduleActive').checked;

    if (!name || !configId || !cronExpression) {
        alert('请填写所有必填字段');
        return;
    }

    const scheduleData = { name, configId: parseInt(configId), cron:cronExpression, isActive };

    try {
        if (scheduleId) {
            await apiRequest(`/api/schedules/${scheduleId}`, 'PUT', scheduleData);
        } else {
            await apiRequest('/api/schedules', 'POST', scheduleData);
        }

        bootstrap.Modal.getInstance(document.getElementById('scheduleModal')).hide();
        loadSchedules();

    } catch (error) {
        alert('保存定时任务失败: ' + error.message);
    }
}

function editSchedule(scheduleId) {
    showScheduleModal(scheduleId);
}

async function deleteSchedule(scheduleId) {
    if (!confirm('确定要删除这个定时任务吗？')) return;

    try {
        await apiRequest(`/api/schedules/${scheduleId}`, 'DELETE');
        loadSchedules();
    } catch (error) {
        alert('删除定时任务失败: ' + error.message);
    }
}

async function executeTask(skus, regions, configId = null) {
    const resultCard = document.getElementById('taskResultCard');
    const resultDiv = document.getElementById('taskResult');

    resultCard.style.display = 'block';
    resultDiv.innerHTML = '<div class="text-center"><div class="spinner-border"></div><p class="mt-2">正在执行任务...</p></div>';

    try {
        const response = await apiRequest('/api/tasks/run', 'POST', {
            skus,
            regions,
            configId
        });

        if (response.results && response.results.length > 0) {
            displayTaskResults(response.results);
        } else {
            resultDiv.innerHTML = '<div class="alert alert-warning">任务执行完成，但未找到结果</div>';
        }

        // 刷新仪表板数据
        if (document.getElementById('dashboard').classList.contains('active')) {
            loadDashboard();
        }

    } catch (error) {
        resultDiv.innerHTML = `<div class="alert alert-danger">任务执行失败: ${error.message}</div>`;
    }
}

function displayTaskResults(results) {
    const resultDiv = document.getElementById('taskResult');

    let html = `
        <div class="alert alert-success">
            <i class="fas fa-check-circle me-2"></i>
            任务执行完成，共获得 ${results.length} 个结果
        </div>
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>SKU</th>
                        <th>地区</th>
                        <th>库存</th>
                    </tr>
                </thead>
                <tbody>
    `;

    results.forEach(result => {
        html += `
            <tr>
                <td>${result.sku}</td>
                <td>${result.region}</td>
                <td>
                    <span class="badge bg-${result.stock.includes('未找到') ? 'danger' : 'success'}">
                        ${result.stock}
                    </span>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    resultDiv.innerHTML = html;
}

async function executeWithConfig() {
    const configId = document.getElementById('configSelect').value;
    if (!configId) {
        alert('请选择配置');
        return;
    }

    try {
        const config = await apiRequest(`/api/configs/${configId}`);
        await executeTask(config.skus, config.regions, configId);
    } catch (error) {
        alert('执行失败: ' + error.message);
    }
}

async function loadConfigsForSelect() {
    try {
        const configs = await apiRequest('/api/configs');
        const select = document.getElementById('configSelect');

        select.innerHTML = '<option value="">选择配置...</option>';
        configs.forEach(config => {
            select.innerHTML += `<option value="${config.id}">${config.name || '未命名配置'}</option>`;
        });

    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

function setupForms() {
    // 快速任务表单
    document.getElementById('quickTaskForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        const skusText = document.getElementById('taskSkus').value.trim();
        const regionsText = document.getElementById('taskRegions').value.trim();

        if (!skusText) {
            alert('请输入SKU');
            return;
        }

        const skus = skusText.split('\n').map(s => s.trim()).filter(s => s);
        const regions = regionsText ? regionsText.split('\n').map(r => r.trim()).filter(r => r) : [];

        await executeTask(skus, regions);
    });
}
