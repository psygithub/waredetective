// Functions for managing schedules

async function loadSchedules() {
    try {
        const schedules = await apiRequest('/api/schedules');
        displaySchedules(schedules);
    } catch (error) {
        console.error('加载定时任务失败:', error);
        document.getElementById('schedulesList').innerHTML = '<p class="text-danger">加载定时任务失败</p>';
    }
}

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

function editSchedule(scheduleId) {
    showScheduleModal(scheduleId);
}

async function deleteSchedule(scheduleId) {
    if (!confirm('确定要删除这个定时任务吗？')) return;

    try {
        await apiRequest(`/api/schedules/${scheduleId}`, 'DELETE');
        loadSchedules();
    } catch (error) {
        alert('删除定时任务失败: ' + error.message);
    }
}
