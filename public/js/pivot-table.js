window.initializeSection = async () => {
    await loadLatestPivotData();
};

async function loadLatestPivotData() {
    const tableHead = document.getElementById('pivot-table-head');
    const tableBody = document.getElementById('pivot-table-body');
    tableHead.innerHTML = '<tr><th>加载中...</th></tr>';
    tableBody.innerHTML = '';

    try {
        const data = await apiRequest(`/api/inventory/pivot-history`);
        
        if (!data || data.columns.length === 0) {
            tableHead.innerHTML = '<tr><th>无数据</th></tr>';
            return;
        }

        let columns = data.columns;
        const rows = data.rows;
        let sortableInstance = null;

        function initSortable() {
            if (sortableInstance) {
                sortableInstance.destroy();
            }
            const headerRow = tableHead.querySelector('tr');
            if (headerRow && typeof Sortable !== 'undefined') {
                sortableInstance = Sortable.create(headerRow, {
                    animation: 150,
                    onEnd: function (evt) {
                        const movedItem = columns.splice(evt.oldIndex, 1)[0];
                        columns.splice(evt.newIndex, 0, movedItem);
                        renderTable();
                    }
                });
            }
        }

        function renderTable() {
            // Render header
            tableHead.innerHTML = `<tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr>`;

            // Render body
            tableBody.innerHTML = rows.map(row => {
                const cells = columns.map(col => {
                    const value = row[col];
                    if (col === '图片') {
                        return `<td><img src="${value || ''}" alt="N/A" width="50"></td>`;
                    }
                    if (value === 0) {
                        return `<td><span class="badge bg-warning">${value}</span></td>`;
                    }
                    return `<td>${value !== null ? value : ''}</td>`;
                }).join('');
                return `<tr>${cells}</tr>`;
            }).join('');

            // Re-initialize sortable after rendering
            initSortable();
        }

        renderTable();

    } catch (error) {
        console.error('加载数据透视表失败:', error);
        tableHead.innerHTML = `<tr><th class="text-danger">加载失败: ${error.message}</th></tr>`;
    }
}
