document.addEventListener('DOMContentLoaded', () => {
    const skuListBody = document.getElementById('sku-list-body');
    const skuInput = document.getElementById('sku-input');
    const addSkuBtn = document.getElementById('add-sku-btn');
    const fetchNowBtn = document.getElementById('fetch-now-btn');
    const cronInput = document.getElementById('cron-input');
    const saveScheduleBtn = document.getElementById('save-schedule-btn');
    const scheduleHistoryList = document.getElementById('schedule-history-list');
    const alertTimespanInput = document.getElementById('alert-timespan-input');
    const alertThresholdInput = document.getElementById('alert-threshold-input');
    const saveAlertConfigBtn = document.getElementById('save-alert-config-btn');
    const runAnalysisBtn = document.getElementById('run-analysis-btn');
    const loadingOverlay = document.querySelector('.loading-overlay');

    const API_BASE_URL = '/api/inventory';
    const token = localStorage.getItem('token');

    const showLoading = (show) => {
        loadingOverlay.style.display = show ? 'flex' : 'none';
    };

    const apiFetch = async (url, options = {}) => {
        showLoading(true);
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    ...options.headers,
                },
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            alert(`操作失败: ${error.message}`);
            console.error('API Fetch Error:', error);
            return null;
        } finally {
            showLoading(false);
        }
    };

    const renderSkuList = (skus) => {
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
    };

    const loadSkus = async () => {
        const skus = await apiFetch(`${API_BASE_URL}/skus`);
        if (skus) {
            renderSkuList(skus);
        }
    };

    addSkuBtn.addEventListener('click', async () => {
        const skusInput = skuInput.value.trim();
        if (!skusInput) {
            alert('请输入 SKU');
            return;
        }

        const skus = skusInput.split(';').map(s => s.trim()).filter(s => s);
        if (skus.length === 0) {
            alert('请输入有效的 SKU');
            return;
        }

        for (const sku of skus) {
            await apiFetch(`${API_BASE_URL}/skus`, {
                method: 'POST',
                body: JSON.stringify({ sku }),
            });
        }

        skuInput.value = '';
        await loadSkus();
    });

    skuListBody.addEventListener('click', async (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.id) {
            const skuId = e.target.dataset.id;
            
            const historyCheck = await apiFetch(`${API_BASE_URL}/skus/${skuId}/has-history`);
            let confirmMessage = "确定要删除这个 SKU 吗？";
            if (historyCheck && historyCheck.hasHistory) {
                confirmMessage = "警告：这个 SKU 存在历史库存数据，删除后将一并清除。确定要删除吗？";
            }

            if (confirm(confirmMessage)) {
                const result = await apiFetch(`${API_BASE_URL}/skus/${skuId}`, {
                    method: 'DELETE',
                });
                if (result) {
                    loadSkus();
                }
            }
        }
    });

    fetchNowBtn.addEventListener('click', async () => {
        if (!confirm('立即查询会覆盖今天已有的最新数据，确定要执行吗？')) {
            return;
        }
        const result = await apiFetch(`${API_BASE_URL}/fetch-now`, {
            method: 'POST',
        });
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

    const loadSchedule = async () => {
        const schedule = await apiFetch(`${API_BASE_URL}/schedule`);
        if (schedule) {
            cronInput.value = schedule.cron;
        } else {
            cronInput.value = '0 2 * * *'; // 默认值
        }
    };

    saveScheduleBtn.addEventListener('click', async () => {
        const cron = cronInput.value.trim();
        if (!cron) {
            alert('请输入 Cron 表达式');
            return;
        }
        const result = await apiFetch(`${API_BASE_URL}/schedule`, {
            method: 'POST',
            body: JSON.stringify({ cron }),
        });
        if (result) {
            alert('定时任务已保存');
            loadSchedule();
        }
    });

    const loadScheduleHistory = async () => {
        const history = await apiFetch(`${API_BASE_URL}/schedule/history`);
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
    };

    const loadAlertConfigs = async () => {
        const configs = await apiFetch(`${API_BASE_URL}/system-configs`);
        if (configs) {
            alertTimespanInput.value = configs.alert_timespan || '7';
            alertThresholdInput.value = configs.alert_threshold || '0.5';
        }
    };

    saveAlertConfigBtn.addEventListener('click', async () => {
        const configs = {
            alert_timespan: alertTimespanInput.value,
            alert_threshold: alertThresholdInput.value,
        };
        const result = await apiFetch(`${API_BASE_URL}/system-configs`, {
            method: 'POST',
            body: JSON.stringify(configs),
        });
        if (result) {
            alert('预警配置已保存');
        }
    });

    runAnalysisBtn.addEventListener('click', async () => {
        if (!confirm('立即执行一次库存分析吗？这可能需要一些时间。')) {
            return;
        }
        const result = await apiFetch(`${API_BASE_URL}/run-analysis`, {
            method: 'POST',
        });
        if (result) {
            alert(result.message);
        }
    });

    // Initial load
    loadSkus();
    loadSchedule();
    loadScheduleHistory();
    loadAlertConfigs();
});
