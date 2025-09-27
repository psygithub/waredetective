window.initializeSection = async () => {
    if (currentUser.role === 'admin') {
        await loadUsers();
        setupEventListeners();
    } else {
        document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="7">您没有权限查看此内容。</td></tr>';
    }
};

async function loadUsers() {
    try {
        const users = await apiRequest('/api/users');
        displayUsers(users);
    } catch (error) {
        console.error('加载用户失败:', error);
        document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="7" class="text-danger">加载用户列表失败</td></tr>';
    }
}

function displayUsers(users) {
    const tableBody = document.getElementById('usersTableBody');
    tableBody.innerHTML = '';

    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7">暂无用户</td></tr>';
        return;
    }

    users.forEach(user => {
        const row = `
            <tr>
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td><span class="badge bg-${getRoleClass(user.role)}">${user.role}</span></td>
                <td><span class="badge bg-${user.isActive ? 'success' : 'secondary'}">${user.isActive ? '激活' : '禁用'}</span></td>
                <td>${new Date(user.createdAt).toLocaleString()}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-btn" data-user-id="${user.id}">编辑</button>
                    <button class="btn btn-sm btn-outline-danger delete-btn" data-user-id="${user.id}" ${user.id === currentUser.id ? 'disabled' : ''}>删除</button>
                </td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

function getRoleClass(role) {
    switch (role) {
        case 'admin': return 'success';
        case 'user': return 'info';
        default: return 'secondary';
    }
}

function setupEventListeners() {
    const userModal = new bootstrap.Modal(document.getElementById('userModal'));
    const userForm = document.getElementById('userForm');
    const saveUserBtn = document.getElementById('saveUserBtn');

    document.getElementById('addUserBtn').addEventListener('click', () => {
        userForm.reset();
        document.getElementById('userId').value = '';
        document.getElementById('userModalLabel').textContent = '添加新用户';
        userModal.show();
    });

    document.getElementById('usersTableBody').addEventListener('click', async (event) => {
        if (event.target.classList.contains('edit-btn')) {
            const userId = event.target.dataset.userId;
            const user = await apiRequest(`/api/users/${userId}`);
            
            document.getElementById('userId').value = user.id;
            document.getElementById('username').value = user.username;
            document.getElementById('email').value = user.email;
            document.getElementById('password').value = '';
            document.getElementById('role').value = user.role;
            document.getElementById('isActive').checked = user.isActive;
            document.getElementById('userModalLabel').textContent = '编辑用户';
            
            userModal.show();
        }

        if (event.target.classList.contains('delete-btn')) {
            const userId = event.target.dataset.userId;
            if (confirm('确定要删除这个用户吗？')) {
                try {
                    await apiRequest(`/api/users/${userId}`, 'DELETE');
                    loadUsers();
                } catch (error) {
                    alert('删除用户失败: ' + error.message);
                }
            }
        }
    });

    saveUserBtn.addEventListener('click', async () => {
        const userId = document.getElementById('userId').value;
        const userData = {
            username: document.getElementById('username').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            role: document.getElementById('role').value,
            isActive: document.getElementById('isActive').checked ? 1 : 0,
        };

        if (!userData.password) {
            delete userData.password; // 如果密码为空，则不更新
        }

        try {
            if (userId) {
                // 更新用户
                await apiRequest(`/api/users/${userId}`, 'PUT', userData);
            } else {
                // 创建用户
                await apiRequest('/api/users', 'POST', userData);
            }
            userModal.hide();
            loadUsers();
        } catch (error) {
            alert('保存用户失败: ' + error.message);
        }
    });
}
