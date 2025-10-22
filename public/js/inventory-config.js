var existingSkus = new Set();
var alertsBySkuId = {};

window.sectionInitializers = window.sectionInitializers || {};
window.sectionInitializers['inventory-config'] = async () => {
    const rowsPerPageSelect = document.getElementById('rows-per-page-select');
    if (rowsPerPageSelect) {
        rowsPerPageSelect.addEventListener('change', () => loadSkus(1));
    }

    // Fetch alerts and process them into a lookup map
    const alerts = await apiRequest('/api/inventory/alerts/all');
    alertsBySkuId = alerts.reduce((acc, alert) => {
        if (!acc[alert.tracked_sku_id]) {
            acc[alert.tracked_sku_id] = [];
        }
        acc[alert.tracked_sku_id].push(alert);
        return acc;
    }, {});

    await loadSkus();
    await loadSchedule();
    await loadScheduleHistory();
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
        if (response.items.length > 0) {
            // Automatically load chart for the first SKU in the list
            loadHistoryForSku(response.items[0].id);
            // Highlight the first row
            setTimeout(() => {
                const firstRow = document.querySelector('#sku-list-body tr');
                if (firstRow) {
                    firstRow.classList.add('table-active');
                }
            }, 0);
        } else {
            // Clear chart if no SKUs
            renderChart([], '无SKU');
        }
    }
}

function getBadgeForLevel(level) {
    switch (level) {
        case 3: return '<span class="badge rounded-pill bg-danger ms-2">高危</span>';
        case 2: return '<span class="badge rounded-pill bg-warning ms-2">中危</span>';
        case 1: return '<span class="badge rounded-pill bg-info ms-2">低危</span>';
        default: return '';
    }
}

function renderSkuList(skus) {
    const skuListBody = document.getElementById('sku-list-body');
    if (!skuListBody) return;
    skuListBody.innerHTML = '';
    if (skus.length === 0) {
        skuListBody.innerHTML = '<tr><td colspan="6" class="text-center">暂无跟踪的 SKU。</td></tr>';
        return;
    }
    skus.forEach(sku => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.dataset.skuId = sku.id;
        
        const alerts = alertsBySkuId[sku.id];
        let highestAlertLevel = 0;
        if (alerts && alerts.length > 0) {
            highestAlertLevel = Math.max(...alerts.map(a => a.alert_level));
        }

        const recordTime = sku.latest_record_time ? new Date(sku.latest_record_time).toLocaleString() : 'N/A';
        tr.innerHTML = `
            <td><img src="${sku.product_image || 'https://via.placeholder.com/50'}" alt="${sku.sku}" width="50" height="50"></td>
            <td>${sku.sku} ${getBadgeForLevel(highestAlertLevel)}</td>
            <td>${sku.latest_qty ?? 'NA'}</td>
            <td>${sku.latest_month_sale ?? 'N/A'}</td>
            <td>${recordTime}</td>
            <td>
                <button class="btn btn-info btn-sm query-btn" data-id="${sku.id}">查询</button>
                <button class="btn btn-warning btn-sm analyze-btn" data-id="${sku.id}">分析</button>
                <button class="btn btn-danger btn-sm delete-btn" data-id="${sku.id}">删除</button>
            </td>
        `;
        skuListBody.appendChild(tr);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const saveSkusBtn = document.getElementById('save-skus-btn');
    if (saveSkusBtn) {
        saveSkusBtn.addEventListener('click', async () => {
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
    }

    const skuListBody = document.getElementById('sku-list-body');
    if (skuListBody) {
        skuListBody.addEventListener('click', async (e) => {
            const target = e.target;
            const tr = target.closest('tr');
            if (!tr) return;

            const skuId = tr.dataset.skuId;

            // Handle delete button click
            if (target.classList.contains('delete-btn')) {
                e.stopPropagation(); // Prevent row click event
                const historyCheck = await apiRequest(`/api/inventory/skus/${skuId}/has-history`);
                let confirmMessage = "确定要删除这个 SKU 吗？";
                if (historyCheck && historyCheck.hasHistory) {
                    confirmMessage = "警告：这个 SKU 存在历史库存数据，删除后将一并清除。确定要删除吗？";
                }
                if (confirm(confirmMessage)) {
                    const result = await apiRequest(`/api/inventory/skus/${skuId}`, 'DELETE');
                    if (result) {
                        loadSkus(currentPage); // Reload current page
                    }
                }
                return;
            }

            // Handle query button click
            if (target.classList.contains('query-btn')) {
                e.stopPropagation(); // Prevent row click event
                querySku(skuId);
                return;
            }

            // Handle analyze button click
            if (target.classList.contains('analyze-btn')) {
                e.stopPropagation(); // Prevent row click event
                analyzeSku(skuId, target);
                return;
            }

            // Handle row click to show chart and toggle alerts
            if (skuId) {
                // Prevent chart loading and alert toggling when clicking a button inside the row
                if (target.tagName === 'BUTTON' || target.closest('button')) {
                    return;
                }

                // Highlight logic
                const isActive = tr.classList.contains('table-active');
                document.querySelectorAll('#sku-list-body tr').forEach(row => row.classList.remove('table-active'));
                if (!isActive) {
                    tr.classList.add('table-active');
                }

                // Always load chart
                loadHistoryForSku(skuId);

                // Toggle alert row
                const hasAlerts = alertsBySkuId[skuId] && alertsBySkuId[skuId].length > 0;
                if (hasAlerts) {
                    toggleAlertRow(skuId, tr);
                }
            }
        });
    }

    const fetchNowBtn = document.getElementById('fetch-now-btn');
    if (fetchNowBtn) {
        fetchNowBtn.addEventListener('click', async () => {
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
    }
});

async function loadSchedule() {
    const cronInput = document.getElementById('cron-input');
    if (!cronInput) return; // Exit if the element doesn't exist

    // There might be multiple schedules, for now, we load the first one for simplicity.
    // A more robust implementation might involve a dropdown or a dedicated management UI.
    const schedules = await apiRequest('/api/schedules');
    if (schedules && schedules.length > 0) {
        cronInput.value = schedules[0].cron;
    } else {
        cronInput.value = '0 2 * * *'; // 默认值
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const saveScheduleBtn = document.getElementById('save-schedule-btn');
    if (saveScheduleBtn) {
        saveScheduleBtn.addEventListener('click', async () => {
            const cronInput = document.getElementById('cron-input');
            if (!cronInput) return;
            const cron = cronInput.value.trim();
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
    }
});

async function loadScheduleHistory() {
    const history = await apiRequest('/api/inventory/schedule/history');
    const scheduleHistoryList = document.getElementById('schedule-history-list');
    if (!scheduleHistoryList) return;
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


async function analyzeSku(skuId, button) {
    try {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        
        const result = await apiRequest(`/api/inventory/run-analysis/${skuId}`, 'POST');
        
        alert(`分析完成！新增 ${result.newAlertsCount} 条预警。`);
        
        // 全面刷新数据以显示最新预警状态
        await initializeSection();

    } catch (error) {
        alert(`分析失败: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerHTML = '分析';
    }
}

function toggleAlertRow(skuId, parentTr) {
    const nextTr = parentTr.nextElementSibling;
    
    // Close any other open alert rows first
    const otherOpenRows = document.querySelectorAll('.alert-detail-row');
    otherOpenRows.forEach(row => {
        if (row !== nextTr) {
            row.remove();
        }
    });

    // Check if the next row is the one we are trying to toggle
    if (nextTr && nextTr.classList.contains('alert-detail-row') && nextTr.dataset.parentSkuId === skuId) {
        // It's our row and it's open, so close it
        nextTr.remove();
    } else {
        // It's either no row or another sku's row, so open ours
        const alertsForSku = alertsBySkuId[skuId];
        if (alertsForSku && alertsForSku.length > 0) {
            const detailTr = document.createElement('tr');
            detailTr.classList.add('alert-detail-row');
            detailTr.dataset.parentSkuId = skuId;
            
            const detailTd = document.createElement('td');
            detailTd.colSpan = "6"; // Span all columns
            
            const alertContent = alertsForSku.sort((a, b) => b.alert_level - a.alert_level).map(alert => {
                const details = JSON.parse(alert.details);
                return `<p class="mb-1">${getBadgeForLevel(alert.alert_level)} <strong>${alert.region_name}:</strong> 库存消耗过快！在 ${details.days} 天内消耗了 ${details.qtyChange} 件 (从 ${details.startQty} 到 ${details.endQty})。</p>`;
            }).join('');

            detailTd.innerHTML = `
                <div class="alert alert-light mb-0">
                    <h6 class="alert-heading">预警详情</h6>
                    ${alertContent}
                </div>
            `;
            
            detailTr.appendChild(detailTd);
            parentTr.after(detailTr);
        }
    }
}

async function querySku(skuId) {
    try {
        const result = await apiRequest(`/api/inventory/fetch-sku/${skuId}`, 'POST');
        if (result) {
            alert(`查询成功: ${result.sku} - 库存: ${result.qty}`);
            loadSkus(currentPage); // 重新加载列表以更新数据
        }
    } catch (error) {
        alert(`查询失败: ${error.message}`);
    }
}

function renderPagination(totalItems, currentPage, rowsPerPage) {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return;

    // Create a dedicated container for links if it doesn't exist, to not overwrite the dropdown
    let linksContainer = document.getElementById('pagination-links');
    if (!linksContainer) {
        linksContainer = document.createElement('div');
        linksContainer.id = 'pagination-links';
        paginationContainer.appendChild(linksContainer);
    }

    const totalPages = Math.ceil(totalItems / rowsPerPage);
    linksContainer.innerHTML = '';

    if (totalPages <= 1) return;

    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    let paginationHTML = `<ul class="pagination mb-0">`; // mb-0 to align with dropdown
    paginationHTML += `<li class="page-item ${prevDisabled}"><a class="page-link" href="#" onclick="event.preventDefault(); loadSkus(${currentPage - 1})">上一页</a></li>`;

    // Simplified pagination links logic
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
        paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); loadSkus(1)">1</a></li>`;
        if (startPage > 2) {
            paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'active' : '';
        paginationHTML += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="event.preventDefault(); loadSkus(${i})">${i}</a></li>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); loadSkus(${totalPages})">${totalPages}</a></li>`;
    }

    paginationHTML += `<li class="page-item ${nextDisabled}"><a class="page-link" href="#" onclick="event.preventDefault(); loadSkus(${currentPage + 1})">下一页</a></li>`;
    paginationHTML += `</ul>`;

    linksContainer.innerHTML = paginationHTML;
}

// --- Chart Functions Migrated from inventory-history.js ---

async function loadHistoryForSku(skuId) {
    const data = await apiRequest(`/api/inventory/regional-history/${skuId}`);
    const productImage = document.getElementById('product-image');
    const chartSkuName = document.getElementById('chart-sku-name');

    if (data) {
        chartSkuName.textContent = `SKU: ${data.sku}`;
        renderChart(data.history, data.sku);
        if (data.product_image) {
            productImage.src = data.product_image;
            productImage.style.display = 'block';
        } else {
            productImage.style.display = 'none';
        }
    } else {
        chartSkuName.textContent = '选择一个 SKU 查看历史记录';
        productImage.style.display = 'none';
        renderChart([], '');
    }
}

function renderChart(historyData, skuName) {
    const chartCanvas = document.getElementById('inventory-chart');
    const regionCheckboxes = document.getElementById('region-checkboxes');
    let inventoryChart = Chart.getChart(chartCanvas);
    if (inventoryChart) {
        inventoryChart.destroy();
    }

    if (!historyData || historyData.length === 0) {
        const ctx = chartCanvas.getContext('2d');
        ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
        ctx.textAlign = 'center';
        ctx.fillText('暂无该 SKU 的历史数据', chartCanvas.width / 2, chartCanvas.height / 2);
        regionCheckboxes.innerHTML = '';
        return;
    }

    const historyByRegion = historyData.reduce((acc, record) => {
        const region = record.region_name || '未知区域';
        if (!acc[region]) {
            acc[region] = [];
        }
        acc[region].push({ x: record.record_date, y: record.qty });
        return acc;
    }, {});

    const datasets = Object.keys(historyByRegion).map((region, index) => {
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        return {
            label: region,
            data: historyByRegion[region],
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length] + '33', // Add alpha for fill
            tension: 0.1,
            fill: false,
        };
    });

    inventoryChart = new Chart(chartCanvas, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        tooltipFormat: 'yyyy-MM-dd',
                    },
                    title: { display: true, text: '日期' }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '库存数量' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (context) => `日期: ${context[0].label}`,
                        label: (context) => `${context.dataset.label}: ${context.parsed.y} 件`,
                    }
                }
            }
        }
    });

    // Render checkboxes
    regionCheckboxes.innerHTML = datasets.map((ds, i) => `
        <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" id="region-${i}" value="${ds.label}" checked>
            <label class="form-check-label" for="region-${i}" style="color: ${ds.borderColor};">${ds.label}</label>
        </div>
    `).join('');

    regionCheckboxes.querySelectorAll('input').forEach((checkbox, index) => {
        checkbox.addEventListener('change', () => {
            inventoryChart.setDatasetVisibility(index, checkbox.checked);
            inventoryChart.update();
        });
    });
}
