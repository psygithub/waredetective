window.initializeSection = async () => {
    await loadResults();
};

async function loadResults() {
    try {
        const results = await apiRequest('/api/results?limit=50');
        displayResults(results);
    } catch (error) {
        console.error('加载结果失败:', error);
        document.getElementById('resultsList').innerHTML = '<p class="text-danger">加载结果失败</p>';
    }
}

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
