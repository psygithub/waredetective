var existingSkus = new Set();

window.initializeSection = async () => {
    document.getElementById('rows-per-page-select').addEventListener('change', () => loadSkus(1));
    await loadSkus();
    await loadSchedule();
    await loadScheduleHistory();
    await loadAlertConfigs();
};

var currentPage = 1;
var rowsPerPage = 20;

async function loadSkus(page = 1) {
    currentPage = page;
    rowsPerPage = document.getElementById('rows-per-page-select').value;
    const response = await apiRequest(`/api/inventory/skus-paginated?page=${page}&limit=${rowsPerPage}`);
    if (response && response.items) {
        existingSkus = new Set(response.items.map(s => s.sku));
        renderSkuList(response.items);
        renderPagination(response.total, page, rowsPerPage);
    }
}

function renderSkuList(skus) {
    const skuListBody = document.getElementById('sku-list-body');
    skuListBody.innerHTML = '';
    if (skus.length === 0) {
        skuListBody.innerHTML = '<tr><td colspan="6" class="text-center">暂无跟踪的 SKU。</td></tr>';
        return;
    }
    skus.forEach(sku => {
        const tr = document.createElement('tr');
        const recordTime = sku.latest_record_time ? new Date(sku.latest_record_time).toLocaleString() : 'N/A';
        tr.innerHTML = `
            <td><img src="${sku.product_image || 'https://via.placeholder.com/50'}" alt="${sku.sku}" width="50" height="50"></td>
            <td>${sku.sku}</td>
            <td>${sku.latest_qty ?? 'NA'}</td>
            <td>${sku.latest_month_sale ?? 'N/A'}</td>
            <td>${recordTime}</td>
            <td>
                <button class="btn btn-info btn-sm" onclick="querySku(${sku.id})">查询</button>
                <button class="btn btn-danger btn-sm" data-id="${sku.id}">删除</button>
            </td>
        `;
        skuListBody.appendChild(tr);
    });
}

document.getElementById('save-skus-btn').addEventListener('click', async () => {
    const skusText = document.getElementById('sku-textarea').value.trim();
    if (!skusText) {
        alert('请输入 SKU');
        return;
    }

    const skus = skusText.split('\n').map(s => s.trim()).filter(s => s);
    if (skus.length === 0) {
        alert('请输入有效的 SKU');
        return;
    }

    // 在发送API请求前去重
    const uniqueSkus = [...new Set(skus)];
    const totalOriginal = skus.length;
    const totalUnique = uniqueSkus.length;

    if (totalOriginal > totalUnique) {
        alert(`您输入了 ${totalOriginal} 个SKU，其中包含重复项。将只处理 ${totalUnique} 个唯一的SKU。`);
    }

    // 过滤掉数据库中已存在的SKU
    const newSkusToSubmit = uniqueSkus.filter(sku => !existingSkus.has(sku));
    const skippedCount = totalUnique - newSkusToSubmit.length;

    if (skippedCount > 0) {
        alert(`${skippedCount} 个SKU因为已存在于跟踪列表中，将被跳过。`);
    }

    if (newSkusToSubmit.length === 0) {
        alert('没有新的SKU需要添加。');
        return;
    }

    // 显示加载指示
    const saveBtn = document.getElementById('save-skus-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 正在添加...';

    let successCount = 0;
    let failCount = 0;
    let failedSkus = [];

    for (const sku of newSkusToSubmit) {
        try {
            const result = await apiRequest('/api/inventory/skus', 'POST', { sku });
            if (result) { // 假设API成功时返回真值
                successCount++;
            } else {
                failCount++;
                failedSkus.push(sku);
            }
        } catch (error) {
            failCount++;
            failedSkus.push(sku);
            console.error(`添加 SKU ${sku} 失败:`, error);
        }
    }

    // 恢复按钮状态
    saveBtn.disabled = false;
    saveBtn.innerHTML = '保存';

    // 显示结果
    let message = `处理完成！\n成功: ${successCount}个\n失败: ${failCount}个`;
    if (failCount > 0) {
        message += `\n失败的SKU: ${failedSkus.join(', ')}`;
    }
    alert(message);

    // 清空文本域并关闭模态框
    document.getElementById('sku-textarea').value = '';
    const modal = bootstrap.Modal.getInstance(document.getElementById('addSkuModal'));
    if (modal) {
        modal.hide();
    }
    
    // 刷新列表
    await loadSkus();
});

document.getElementById('sku-list-body').addEventListener('click', async (e) => {
    if (e.target.tagName === 'BUTTON' && e.target.dataset.id) {
        const skuId = e.target.dataset.id;
        
        const historyCheck = await apiRequest(`/api/inventory/skus/${skuId}/has-history`);
        let confirmMessage = "确定要删除这个 SKU 吗？";
        if (historyCheck && historyCheck.hasHistory) {
            confirmMessage = "警告：这个 SKU 存在历史库存数据，删除后将一并清除。确定要删除吗？";
        }

        if (confirm(confirmMessage)) {
            const result = await apiRequest(`/api/inventory/skus/${skuId}`, 'DELETE');
            if (result) {
                loadSkus();
            }
        }
    }
});

document.getElementById('fetch-now-btn').addEventListener('click', async () => {
    if (!confirm('立即查询会覆盖今天已有的最新数据，确定要执行吗？')) {
        return;
    }
    const result = await apiRequest('/api/inventory/fetch-now', 'POST');
    if (result) {
        let message = '查询完成！\n';
        if (result.success && result.success.length > 0) {
            message += `成功: ${result.success.length}个\n`;
            result.success.forEach(item => {
                message += `- ${item.sku} (${item.name}): ${item.qty}\n`;
            });
        }
        if (result.failed && result.failed.length > 0) {
            message += `失败: ${result.failed.length}个 (${result.failed.join(', ')})\n`;
        }
        alert(message);
        await loadSkus();
        await loadScheduleHistory();
    }
});

async function loadSchedule() {
    // There might be multiple schedules, for now, we load the first one for simplicity.
    // A more robust implementation might involve a dropdown or a dedicated management UI.
    const schedules = await apiRequest('/api/schedules');
    if (schedules && schedules.length > 0) {
        document.getElementById('cron-input').value = schedules[0].cron;
    } else {
        document.getElementById('cron-input').value = '0 2 * * *'; // 默认值
    }
}

document.getElementById('save-schedule-btn').addEventListener('click', async () => {
    const cron = document.getElementById('cron-input').value.trim();
    if (!cron) {
        alert('请输入 Cron 表达式');
        return;
    }
    // This assumes we are updating the first schedule found or creating a new one.
    // This logic should be refined if multiple schedules are officially supported in the UI.
    const schedules = await apiRequest('/api/schedules');
    const scheduleData = {
        name: 'Default Inventory Schedule',
        cron: cron,
        configId: 1, // Assuming a default configId, this should be made dynamic.
        isActive: true
    };

    try {
        if (schedules && schedules.length > 0) {
            // Update existing schedule
            await apiRequest(`/api/schedules/${schedules[0].id}`, 'PUT', scheduleData);
        } else {
            // Create new schedule
            await apiRequest('/api/schedules', 'POST', scheduleData);
        }
        alert('定时任务已保存');
        loadSchedule();
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
});

async function loadScheduleHistory() {
    const history = await apiRequest('/api/inventory/schedule/history');
    const scheduleHistoryList = document.getElementById('schedule-history-list');
    scheduleHistoryList.innerHTML = '';
    if (history && history.length > 0) {
        history.forEach(item => {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            
            // Defensive parsing to handle old, double-stringified data
            let skuArray = [];
            if (Array.isArray(item.skus)) {
                skuArray = item.skus;
            } else if (typeof item.skus === 'string') {
                try {
                    skuArray = JSON.parse(item.skus);
                } catch (e) {
                    skuArray = [item.skus]; // Fallback for non-JSON strings
                }
            }

            const skus = skuArray.join(', ');
            const time = new Date(item.createdAt).toLocaleString();
            li.innerHTML = `<strong>${time}:</strong> 对 ${skus} 的查询已完成，状态: ${item.status}。`;
            scheduleHistoryList.appendChild(li);
        });
    } else {
        scheduleHistoryList.innerHTML = '<li class="list-group-item">暂无定时任务执行历史。</li>';
    }
}

async function loadAlertConfigs() {
    const configs = await apiRequest('/api/inventory/system-configs');
    if (configs) {
        document.getElementById('alert-timespan-input').value = configs.alert_timespan || '7';
        document.getElementById('alert-threshold-input').value = configs.alert_threshold || '0.5';
    }
}

document.getElementById('save-alert-config-btn').addEventListener('click', async () => {
    const configs = {
        alert_timespan: document.getElementById('alert-timespan-input').value,
        alert_threshold: document.getElementById('alert-threshold-input').value,
    };
    const result = await apiRequest('/api/inventory/system-configs', 'POST', { configs });
    if (result) {
        alert('预警配置已保存');
    }
});

document.getElementById('run-analysis-btn').addEventListener('click', async () => {
    if (!confirm('立即执行一次库存分析吗？这可能需要一些时间。')) {
        return;
    }
    const result = await apiRequest('/api/inventory/run-analysis', 'POST');
    if (result) {
        alert(result.message);
    }
});

async function querySku(skuId) {
    try {
        const result = await apiRequest(`/api/inventory/fetch-sku/${skuId}`, 'POST');
        if (result) {
            alert(`查询成功: ${result.sku} - 库存: ${result.qty}`);
            loadSkus(); // 重新加载列表以更新数据
        }
    } catch (error) {
        alert(`查询失败: ${error.message}`);
    }
}

function renderPagination(totalItems, currentPage, rowsPerPage) {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return;

    const totalPages = Math.ceil(totalItems / rowsPerPage);
    paginationContainer.innerHTML = '';

    if (totalPages <= 1) return;

    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    let paginationHTML = `<ul class="pagination">`;
    paginationHTML += `<li class="page-item ${prevDisabled}"><a class="page-link" href="#" onclick="loadSkus(${currentPage - 1})">上一页</a></li>`;

    for (let i = 1; i <= totalPages; i++) {
        const activeClass = i === currentPage ? 'active' : '';
        paginationHTML += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="loadSkus(${i})">${i}</a></li>`;
    }

    paginationHTML += `<li class="page-item ${nextDisabled}"><a class="page-link" href="#" onclick="loadSkus(${currentPage + 1})">下一页</a></li>`;
    paginationHTML += `</ul>`;

    paginationContainer.innerHTML = paginationHTML;
}
