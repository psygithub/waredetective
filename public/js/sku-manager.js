class SkuManager {
    constructor(options = {}) {
        this.onSave = options.onSave || function() {};
        
        this.modal = new bootstrap.Modal(document.getElementById('skuManagerModal'));
        this.toastElement = document.getElementById('liveToast');
        this.toast = new bootstrap.Toast(this.toastElement);

        this.selectedSkus = new Map();
        this.userSkus = new Map();
        this.currentSkuPage = 1;
        this.currentUserId = null;

        this.initEventListeners();
    }

    showToast(message, title = '提示') {
        document.getElementById('toastTitle').textContent = title;
        document.getElementById('toastBody').textContent = message;
        this.toast.show();
    }

    async openForUser(userId, username) {
        this.currentUserId = userId;
        document.getElementById('skuUserId').value = userId;
        document.getElementById('skuManagerModalLabel').textContent = `管理用户 [${username}] 的SKU`;

        // Reset state
        this.selectedSkus.clear();
        this.userSkus.clear();
        this.currentSkuPage = 1;
        document.getElementById('manualSkuInput').value = '';
        document.getElementById('manualSkuResult').innerHTML = '';

        // Load user's existing SKUs
        const existingSkus = await apiRequest(`/api/users/${userId}/skus`);
        existingSkus.forEach(sku => {
            const skuData = { ...sku, expires_at: sku.expires_at };
            this.userSkus.set(sku.id, skuData);
            this.selectedSkus.set(sku.id, skuData);
        });

        this.renderSelectedSkus();
        // Clear previous list and pagination
        document.getElementById('systemSkusTableBody').innerHTML = '';
        document.getElementById('skuPagination').innerHTML = '';
        
        // Load the first page of system SKUs automatically
        await this.loadSystemSkus(1);

        this.modal.show();
    }

    initEventListeners() {
        document.getElementById('querySkuBtn').addEventListener('click', async () => {
            const skuValue = document.getElementById('manualSkuInput').value.trim();
            document.getElementById('manualSkuResult').innerHTML = ''; // Clear previous messages
            if (!skuValue) {
                document.getElementById('manualSkuResult').innerHTML = `<div class="text-info">请输入SKU进行查询。</div>`;
                document.getElementById('systemSkusTableBody').innerHTML = '';
                document.getElementById('skuPagination').innerHTML = '';
                return;
            }
            await this.loadSystemSkus(1, skuValue);
        });

        document.getElementById('selectedSkusContainer').addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-sku-btn')) {
                const skuId = parseInt(event.target.dataset.skuId);
                if (this.userSkus.has(skuId)) {
                    return;
                }
                this.selectedSkus.delete(skuId);
                this.renderSelectedSkus();
                this.updateSystemSkusTable();
            }
        });

        document.getElementById('systemSkusTableBody').addEventListener('click', (event) => {
            const target = event.target;
            const skuId = parseInt(target.dataset.skuId);
            if (!skuId) return;

            // Handle main SKU selection checkbox
            if (target.classList.contains('sku-select-checkbox')) {
                const skuData = JSON.parse(target.dataset.skuData);
                if (target.checked) {
                    // When selecting, also grab the current expiry date value
                    const dateInput = document.querySelector(`.sku-expires-date[data-sku-id="${skuId}"]`);
                    const longTermCheck = document.querySelector(`.sku-long-term-check[data-sku-id="${skuId}"]`);
                    skuData.expires_at = longTermCheck.checked ? null : dateInput.value;
                    this.selectedSkus.set(skuId, skuData);
                } else {
                    this.selectedSkus.delete(skuId);
                }
                this.renderSelectedSkus();
            }

            // Handle "long-term" checkbox
            if (target.classList.contains('sku-long-term-check')) {
                const dateInput = document.querySelector(`.sku-expires-date[data-sku-id="${skuId}"]`);
                if (target.checked) {
                    dateInput.disabled = true;
                    dateInput.value = '';
                    if (this.selectedSkus.has(skuId)) {
                        this.selectedSkus.get(skuId).expires_at = null;
                    }
                } else {
                    dateInput.disabled = false;
                    // Optionally set a default date, e.g., 30 days from now
                    const today = new Date();
                    today.setDate(today.getDate() + 30);
                    const defaultValue = today.toISOString().split('T')[0];
                    dateInput.value = defaultValue;
                    if (this.selectedSkus.has(skuId)) {
                        this.selectedSkus.get(skuId).expires_at = dateInput.value;
                    }
                }
                this.renderSelectedSkus();
            }
        });

        // Handle date input changes
        document.getElementById('systemSkusTableBody').addEventListener('change', (event) => {
            const target = event.target;
            const skuId = parseInt(target.dataset.skuId);
            if (target.classList.contains('sku-expires-date')) {
                if (this.selectedSkus.has(skuId)) {
                    this.selectedSkus.get(skuId).expires_at = target.value;
                }
                this.renderSelectedSkus();
            }
        });

        document.getElementById('saveUserSkusBtn').addEventListener('click', async () => {
            const skusToSave = [];
            this.selectedSkus.forEach((value, key) => {
                skusToSave.push({
                    skuId: key,
                    expires_at: value.expires_at || null
                });
            });

            try {
                await apiRequest(`/api/users/${this.currentUserId}/skus`, 'POST', { skus: skusToSave });
                this.modal.hide();
                this.showToast('保存成功');
                this.onSave(); // Trigger callback
            } catch (error) {
                const errorMessage = error.message.split(' (')[0];
                this.showToast('保存失败: ' + errorMessage, '错误');
            }
        });
        
        document.getElementById('skuPagination').addEventListener('click', (event) => {
            event.preventDefault();
            if (event.target.tagName === 'A') {
                const page = parseInt(event.target.dataset.page);
                if (page !== this.currentSkuPage) {
                    this.currentSkuPage = page;
                    this.loadSystemSkus(this.currentSkuPage, document.getElementById('manualSkuInput').value.trim());
                }
            }
        });
    }

    renderSelectedSkus() {
        const container = document.getElementById('selectedSkusContainer');
        container.innerHTML = '';
        this.selectedSkus.forEach((sku, id) => {
            const expiresText = sku.expires_at ? new Date(sku.expires_at).toLocaleDateString() : '长期有效';
            const tag = `
                <span class="badge ${this.userSkus.has(id) ? 'bg-secondary' : 'bg-primary'} d-flex align-items-center">
                    <span class="py-1">${sku.sku} (${expiresText})</span>
                    <button type="button" class="btn-close btn-close-white ms-2 remove-sku-btn" aria-label="Close" data-sku-id="${id}"></button>
                </span>
            `;
            container.insertAdjacentHTML('beforeend', tag);
        });
    }

    async loadSystemSkus(page = 1, search = '') {
        try {
            const response = await apiRequest(`/api/skus?page=${page}&limit=20&search=${search}`);
            const tableBody = document.getElementById('systemSkusTableBody');
            const resultContainer = document.getElementById('manualSkuResult');
            tableBody.innerHTML = '';
            
            if (response.items.length === 0) {
                resultContainer.innerHTML = `<div class="text-warning">未找到匹配的SKU。</div>`;
            } else {
                resultContainer.innerHTML = '';
            }

            response.items.forEach(sku => {
                const selectedSkuData = this.selectedSkus.get(sku.id);
                const isSelected = !!selectedSkuData;
                const expiresValue = selectedSkuData && selectedSkuData.expires_at ? selectedSkuData.expires_at.split('T')[0] : '';
                const isLongTerm = selectedSkuData ? !selectedSkuData.expires_at : true;

                const productName = sku.product_name || 'N/A';
                const row = `
                    <tr>
                        <td>
                            <input type="checkbox" class="form-check-input sku-select-checkbox" data-sku-id="${sku.id}" data-sku-data='${JSON.stringify(sku)}' 
                            ${isSelected ? 'checked' : ''}>
                        </td>
                        <td><img src="${sku.product_image || ''}" alt="N/A" width="50"></td>
                        <td>${sku.sku}</td>
                        <td title="${productName}" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${productName}
                        </td>
                        <td>
                            <div class="d-flex align-items-center">
                                <input type="date" class="form-control form-control-sm sku-expires-date" data-sku-id="${sku.id}" value="${expiresValue}" ${isLongTerm ? 'disabled' : ''}>
                                <div class="form-check ms-2">
                                    <input class="form-check-input sku-long-term-check" type="checkbox" data-sku-id="${sku.id}" ${isLongTerm ? 'checked' : ''}>
                                    <label class="form-check-label small">长期</label>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', row);
            });
            this.renderPagination(response.total, response.page, response.limit);
        } catch (error) {
            console.error('加载系统SKU失败:', error);
        }
    }
    
    updateSystemSkusTable() {
        const checkboxes = document.querySelectorAll('#systemSkusTableBody input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            const skuId = parseInt(checkbox.dataset.skuId);
            checkbox.checked = this.selectedSkus.has(skuId);
        });
    }

    renderPagination(total, page, limit) {
        const paginationContainer = document.getElementById('skuPagination');
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(total / limit);

        for (let i = 1; i <= totalPages; i++) {
            const li = `<li class="page-item ${i === page ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
            paginationContainer.insertAdjacentHTML('beforeend', li);
        }
    }
}
