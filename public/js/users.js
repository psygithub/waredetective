window.initializeSection = async () => {
    if (currentUser.role === 'super_admin') {
        await loadUsers();
    }
};

async function loadUsers() {
    if (currentUser.role !== 'super_admin') return;

    try {
        const users = await apiRequest('/api/users');
        displayUsers(users);
    } catch (error) {
        console.error('加载用户失败:', error);
        document.getElementById('usersList').innerHTML = '<p class="text-danger">加载用户失败</p>';
    }
}

function displayUsers(users) {
    const container = document.getElementById('usersList');

    if (users.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无用户</p>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>用户名</th>
                        <th>邮箱</th>
                        <th>角色</th>
                        <th>状态</th>
                        <th>注册时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
    `;

    users.forEach(user => {
        html += `
            <tr>
                <td><strong>${user.username}</strong></td>
                <td>${user.email}</td>
                <td>
                    <span class="badge bg-${user.role === 'super_admin' ? 'danger' : user.role === 'admin' ? 'warning' : 'info'}">
                        ${getRoleText(user.role)}
                    </span>
                </td>
                <td>
                    <span class="badge bg-${user.isActive ? 'success' : 'secondary'}">
                        ${user.isActive ? '活跃' : '禁用'}
                    </span>
                </td>
                <td>${new Date(user.createdAt).toLocaleString()}</td>
                <td>
                    ${user.id !== currentUser.id ? `
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : '<span class="text-muted">当前用户</span>'}
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

async function deleteUser(userId) {
    if (!confirm('确定要删除这个用户吗？')) return;

    try {
        await apiRequest(`/api/users/${userId}`, 'DELETE');
        loadUsers();
    } catch (error) {
        alert('删除用户失败: ' + error.message);
    }
}
