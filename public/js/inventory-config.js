window.initializeSection = async () => {
    await loadSkus();
    await loadSchedule();
    await loadScheduleHistory();
    await loadAlertConfigs();
};

async function loadSkus() {
    const skus = await apiRequest('/api/inventory/skus');
    if (skus) {
        renderSkuList(skus);
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
            <td>${sku.latest_qty ?? 'N/A'}</td>
            <td>${sku.latest_month_sale ?? 'N/A'}</td>
            <td>${recordTime}</td>
            <td><button class="btn btn-danger btn-sm" data-id="${sku.id}">删除</button></td>
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

    // 显示加载指示
    const saveBtn = document.getElementById('save-skus-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 正在添加...';

    let successCount = 0;
    let failCount = 0;
    let failedSkus = [];

    for (const sku of skus) {
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
    const schedule = await apiRequest('/api/inventory/schedule');
    if (schedule) {
        document.getElementById('cron-input').value = schedule.cron;
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
    const result = await apiRequest('/api/inventory/schedule', 'POST', { cron });
    if (result) {
        alert('定时任务已保存');
        loadSchedule();
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
            const skus = item.skus.join(', ');
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
