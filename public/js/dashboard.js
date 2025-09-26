window.initializeSection = async () => {
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
};

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

async function loadAlerts() {
    try {
        const alerts = await apiRequest('/api/inventory/alerts');
        displayAlerts(alerts);
    } catch (error) {
        console.error('加载预警失败:', error);
        document.getElementById('alertsList').innerHTML = '<p class="text-danger">加载预警失败</p>';
    }
}

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
