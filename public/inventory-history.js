document.addEventListener('DOMContentLoaded', () => {
    const skuSelect = document.getElementById('sku-select');
    const chartCanvas = document.getElementById('inventory-chart');
    const regionCheckboxes = document.getElementById('region-checkboxes');
    const API_BASE_URL = '/api/inventory';
    const token = localStorage.getItem('token');
    let inventoryChart = null;

    const apiFetch = async (url, options = {}) => {
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
            alert(`数据加载失败: ${error.message}`);
            console.error('API Fetch Error:', error);
            return null;
        }
    };

    const renderChart = (historyData, skuName) => {
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
    };

    const loadHistoryForSku = async (skuId) => {
        const data = await apiFetch(`${API_BASE_URL}/regional-history/${skuId}`);
        const productImage = document.getElementById('product-image');

        if (data) {
            renderChart(data.history, data.sku);
            if (data.product_image) {
                productImage.src = data.product_image;
                productImage.style.display = 'block';
            } else {
                productImage.style.display = 'none';
            }
        } else {
            productImage.style.display = 'none';
            renderChart([], '');
        }
    };

    const init = async () => {
        const skus = await apiFetch(`${API_BASE_URL}/skus`);
        if (skus && skus.length > 0) {
            skuSelect.innerHTML = skus.map(sku => `<option value="${sku.id}">${sku.sku} - ${sku.product_name || 'N/A'}</option>`).join('');
            if (skus[0]) {
                loadHistoryForSku(skus[0].id);
            }
        } else {
            skuSelect.innerHTML = '<option>没有可供选择的 SKU</option>';
            renderChart([], '');
        }
    };

    skuSelect.addEventListener('change', (e) => {
        const skuId = e.target.value;
        if (skuId) {
            loadHistoryForSku(skuId);
        }
    });

    init();
});
