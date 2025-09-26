// 全局变量
let currentUser = null;
let token = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function () {
    // 检查登录状态
    token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
        window.location.href = '/login';
        return;
    }

    currentUser = JSON.parse(userStr);

    // 验证token
    verifyToken().then(valid => {
        if (!valid) {
            window.location.href = '/login';
            return;
        }

        // 初始化页面
        initializePage();
    });
});

// 验证token
async function verifyToken() {
    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// 初始化页面
function initializePage() {
    // 显示用户信息
    document.getElementById('userInfo').textContent = `${currentUser.username} (${getRoleText(currentUser.role)})`;

    // 如果是超级管理员，显示用户管理菜单
    if (currentUser.role === 'super_admin') {
        document.getElementById('userManagementNav').style.display = 'block';
    }

    // 设置导航事件
    setupNavigation();

    // 加载仪表板数据
    loadDashboard();

    // 设置表单事件
    setupForms();
}

// 获取角色文本
function getRoleText(role) {
    const roleMap = {
        'super_admin': '超级管理员',
        'admin': '管理员',
        'user': '普通用户'
    };
    return roleMap[role] || '未知';
}

// 设置导航
function setupNavigation() {
    document.querySelectorAll('.sidebar .nav-link[data-section]').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();

            const section = this.getAttribute('data-section');
            showSection(section);

            // 更新导航状态
            document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// 显示指定部分
function showSection(section) {
    // 隐藏所有部分
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));

    // 显示指定部分
    const targetSection = document.getElementById(section);
    if (targetSection) {
        targetSection.classList.add('active');

        // 根据部分加载相应数据
        switch (section) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'configs':
                loadConfigs();
                break;
            case 'schedules':
                loadSchedules();
                break;
            case 'tasks':
                loadConfigsForSelect();
                break;
            case 'results':
                loadResults();
                break;
            case 'users':
                if (currentUser.role === 'super_admin') {
                    loadUsers();
                }
                break;
        }
    }
}

// 加载仪表板数据
async function loadDashboard() {
    try {
        // 加载统计数据
        const [configsRes, schedulesRes, resultsRes, usersRes] = await Promise.all([
            apiRequest('/api/configs'),
            apiRequest('/api/schedules'),
            apiRequest('/api/results?limit=10'),
            currentUser.role === 'super_admin' ? apiRequest('/api/users') : Promise.resolve([])
        ]);

        // 更新统计卡片
        document.getElementById('totalConfigs').textContent = configsRes.length;
        document.getElementById('activeSchedules').textContent = schedulesRes.filter(s => s.isActive).length;

        // 计算今日结果
        const today = new Date().toDateString();
        const todayResults = resultsRes.filter(r => new Date(r.createdAt).toDateString() === today);
        document.getElementById('todayResults').textContent = todayResults.length;

        if (currentUser.role === 'super_admin') {
            document.getElementById('totalUsers').textContent = usersRes.length;
        } else {
            document.getElementById('totalUsers').textContent = '-';
        }

        // 显示最近结果
        displayRecentResults(resultsRes.slice(0, 5));

        // 加载库存预警
        loadAlerts();

    } catch (error) {
        console.error('加载仪表板数据失败:', error);
    }
}

// 显示最近结果
function displayRecentResults(results) {
    const container = document.getElementById('recentResults');

    if (results.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无检测结果</p>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>时间</th>
                        <th>SKU数量</th>
                        <th>结果数量</th>
                        <th>状态</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
    `;

    results.forEach(result => {
        html += `
            <tr>
                <td>${new Date(result.createdAt).toLocaleString()}</td>
                <td>${Array.isArray(result.skus) ? result.skus.length : 1}</td>
                <td>${Array.isArray(result.results) ? result.results.length : 0}</td>
                <td>
                    <span class="badge bg-${result.status === 'completed' ? 'success' : 'warning'}">
                        ${result.status === 'completed' ? '完成' : '进行中'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-info" onclick="viewRecentResultDetail(${result.id})">
                        <i class="fas fa-eye"></i> 查看详情
                    </button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

async function viewRecentResultDetail(resultId) {
    try {
        const result = await apiRequest(`/api/results/${resultId}`);
        showResultDetailModal(result);
    } catch (error) {
        alert('加载结果详情失败: ' + error.message);
    }
}

function showResultDetailModal(result) {
    let html = `
        <div class="modal fade" id="recentResultDetailModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">检测结果详情</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>检测时间:</strong> ${new Date(result.createdAt).toLocaleString()}
                            </div>
                            <div class="col-md-6">
                                <strong>状态:</strong> 
                                <span class="badge bg-${result.status === 'completed' ? 'success' : 'warning'}">
                                    ${result.status === 'completed' ? '完成' : '进行中'}
                                </span>
                            </div>
                        </div>
    `;

    if (result.results && result.results.length > 0) {
        html += `
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>图片</th>
                            <th>链接</th>
                            <th>SKU</th>
                            <th>地区</th>
                            <th>库存</th>
                            <th>检测时间</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        result.results.forEach(item => {
            html += `
                <tr>
                    <td>
                        <img src="${item.img}" alt="商品图片" style="max-width:80px;max-height:80px;">
                    </td>
                    <td>
                        <a href="${item.url}" target="_blank" rel="noopener noreferrer">链接</a>
                    </td>
                    <td>${item.sku}</td>
                    <td>${item.region}</td>
                    <td>
                        <span class="badge ${(item.stock && item.stock.includes('未找到')) ? 'bg-danger' : 'bg-success'}">
                            ${item.stock ?? '无数据'}
                        </span>
                    </td>
                    <td>${new Date(item.lastUpdated || item.createdAt).toLocaleString()}</td>
                </tr>
            `;
        });
        html += '</tbody></table></div>';
    } else {
        html += '<p class="text-muted">暂无结果数据</p>';
    }

    html += `
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 移除已存在的模态框
    const existingModal = document.getElementById('recentResultDetailModal');
    if (existingModal) {
        existingModal.remove();
    }

    // 添加新模态框
    document.body.insertAdjacentHTML('beforeend', html);

    // 显示模态框
    const modal = new bootstrap.Modal(document.getElementById('recentResultDetailModal'));
    modal.show();
}


// 加载配置列表
async function loadConfigs() {
    try {
        const configs = await apiRequest('/api/configs');
        displayConfigs(configs);
    } catch (error) {
        console.error('加载配置失败:', error);
        document.getElementById('configsList').innerHTML = '<p class="text-danger">加载配置失败</p>';
    }
}

// 显示配置列表
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
            // 可以设置默认值或进行其他错误处理
        }

        let regionsArray = [];
        try {
            regionsArray = JSON.parse(config.regions);
        } catch (error) {
            console.error("REGION数据解析失败:", error);
            // 可以设置默认值或进行其他错误处理
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

// 加载定时任务列表
async function loadSchedules() {
    try {
        const schedules = await apiRequest('/api/schedules');
        displaySchedules(schedules);
    } catch (error) {
        console.error('加载定时任务失败:', error);
        document.getElementById('schedulesList').innerHTML = '<p class="text-danger">加载定时任务失败</p>';
    }
}

// 显示定时任务列表
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

// 加载结果列表
async function loadResults() {
    try {
        const results = await apiRequest('/api/results?limit=50');
        displayResults(results);
    } catch (error) {
        console.error('加载结果失败:', error);
        document.getElementById('resultsList').innerHTML = '<p class="text-danger">加载结果失败</p>';
    }
}

// 显示结果列表
function displayResults(results) {
    const container = document.getElementById('resultsList');

    if (results.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无检测结果</p>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>时间</th>
                        <th>SKU</th>
                        <th>地区</th>
                        <th>结果数量</th>
                        <th>状态</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
    `;

    results.forEach(result => {
        const skuText = Array.isArray(result.skus) ? result.skus.join(', ') : (result.skus || '-');
        const regionText = Array.isArray(result.regions) ? result.regions.join(', ') : (result.regions || '-');
        const resultCount = Array.isArray(result.results) ? result.results.length : 0;

        html += `
            <tr>
                <td>${new Date(result.createdAt).toLocaleString()}</td>
                <td title="${skuText}">${skuText.length > 30 ? skuText.substring(0, 30) + '...' : skuText}</td>
                <td>${regionText}</td>
                <td>${resultCount}</td>
                <td>
                    <span class="badge bg-${result.status === 'completed' ? 'success' : 'warning'}">
                        ${result.status === 'completed' ? '完成' : '进行中'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-info" onclick="viewResult(${result.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// 加载用户列表
async function loadUsers() {
    if (currentUser.role !== 'super_admin') return;

    try {
        const users = await apiRequest('/api/users');
        displayUsers(users);
    } catch (error) {
        console.error('加载用户失败:', error);
        document.getElementById('usersList').innerHTML = '<p class="text-danger">加载用户失败</p>';
    }
}

// 显示用户列表
function displayUsers(users) {
    const container = document.getElementById('usersList');

    if (users.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无用户</p>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>用户名</th>
                        <th>邮箱</th>
                        <th>角色</th>
                        <th>状态</th>
                        <th>注册时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
    `;

    users.forEach(user => {
        html += `
            <tr>
                <td><strong>${user.username}</strong></td>
                <td>${user.email}</td>
                <td>
                    <span class="badge bg-${user.role === 'super_admin' ? 'danger' : user.role === 'admin' ? 'warning' : 'info'}">
                        ${getRoleText(user.role)}
                    </span>
                </td>
                <td>
                    <span class="badge bg-${user.isActive ? 'success' : 'secondary'}">
                        ${user.isActive ? '活跃' : '禁用'}
                    </span>
                </td>
                <td>${new Date(user.createdAt).toLocaleString()}</td>
                <td>
                    ${user.id !== currentUser.id ? `
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : '<span class="text-muted">当前用户</span>'}
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// 设置表单事件
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

// 执行任务
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

// 显示任务结果
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

// 使用配置执行任务
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

// 加载配置到选择框
async function loadConfigsForSelect() {
    try {
        const configs = await apiRequest('/api/configs');
        const select = document.getElementById('configSelect');

        select.innerHTML = '<option value="">选择配置...</option>';
        configs.forEach(config => {
            select.innerHTML += `<option value="${config.id}">${config.name || '未命名配置'}</option>`;
        });

        // 同时更新定时任务模态框中的配置选择
        const scheduleSelect = document.getElementById('scheduleConfigId');
        scheduleSelect.innerHTML = '<option value="">选择配置...</option>';
        configs.forEach(config => {
            scheduleSelect.innerHTML += `<option value="${config.id}">${config.name || '未命名配置'}</option>`;
        });

    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

// 显示配置模态框
function showConfigModal(configId = null) {
    const modal = new bootstrap.Modal(document.getElementById('configModal'));

    if (configId) {
        // 编辑模式
        loadConfigForEdit(configId);
    } else {
        // 新建模式
        document.getElementById('configForm').reset();
        document.getElementById('configId').value = '';
    }

    modal.show();
}

// 加载配置用于编辑
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

// 保存配置
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

// 编辑配置
function editConfig(configId) {
    showConfigModal(configId);
}

// 删除配置
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

// 显示定时任务模态框
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

// 加载定时任务用于编辑
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

// 保存定时任务
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

// 编辑定时任务
function editSchedule(scheduleId) {
    showScheduleModal(scheduleId);
}

// 删除定时任务
async function deleteSchedule(scheduleId) {
    if (!confirm('确定要删除这个定时任务吗？')) return;

    try {
        await apiRequest(`/api/schedules/${scheduleId}`, 'DELETE');
        loadSchedules();
    } catch (error) {
        alert('删除定时任务失败: ' + error.message);
    }
}

// 查看结果详情
async function viewResult(resultId) {
    try {
        const result = await apiRequest(`/api/results/${resultId}`);

        let html = `
            <div class="modal fade" id="resultModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">检测结果详情</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <strong>检测时间:</strong> ${new Date(result.createdAt).toLocaleString()}
                                </div>
                                <div class="col-md-6">
                                    <strong>状态:</strong> 
                                    <span class="badge bg-${result.status === 'completed' ? 'success' : 'warning'}">
                                        ${result.status === 'completed' ? '完成' : '进行中'}
                                    </span>
                                </div>
                            </div>
        `;

        if (result.results && result.results.length > 0) {
            html += `
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

            result.results.forEach(item => {
                html += `
                    <tr>
                        <td>${item.sku}</td>
                        <td>${item.region}</td>
                        <td>
                            <span class="badge bg-${item.stock.includes('未找到') ? 'danger' : 'success'}">
                                ${item.stock}
                            </span>
                        </td>
                    </tr>
                `;
            });

            html += '</tbody></table></div>';
        } else {
            html += '<p class="text-muted">暂无结果数据</p>';
        }

        html += `
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 移除已存在的模态框
        const existingModal = document.getElementById('resultModal');
        if (existingModal) {
            existingModal.remove();
        }

        // 添加新模态框
        document.body.insertAdjacentHTML('beforeend', html);

        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('resultModal'));
        modal.show();

    } catch (error) {
        alert('加载结果详情失败: ' + error.message);
    }
}

// 删除用户
async function deleteUser(userId) {
    if (!confirm('确定要删除这个用户吗？')) return;

    try {
        await apiRequest(`/api/users/${userId}`, 'DELETE');
        loadUsers();
    } catch (error) {
        alert('删除用户失败: ' + error.message);
    }
}

// API请求封装
async function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '请求失败');
    }

    return await response.json();
}

// 加载库存预警
async function loadAlerts() {
    try {
        const alerts = await apiRequest('/api/inventory/alerts');
        displayAlerts(alerts);
    } catch (error) {
        console.error('加载预警失败:', error);
        document.getElementById('alertsList').innerHTML = '<p class="text-danger">加载预警失败</p>';
    }
}

// 显示库存预警
function displayAlerts(alerts) {
    const container = document.getElementById('alertsList');

    if (alerts.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无库存预警</p>';
        return;
    }

    let html = `
        <div class="list-group">
    `;

    alerts.forEach(alert => {
        const details = JSON.parse(alert.details);
        html += `
            <div class="list-group-item list-group-item-action">
                <div class="d-flex w-100 justify-content-between">
                    <h5 class="mb-1">${alert.sku} 在 ${alert.region_name}</h5>
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

// 退出登录
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}
