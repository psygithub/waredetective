// 全局变量
let currentUser = null;
let token = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function () {
    // 检查登录状态
    token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
        window.location.href = '/login';
        return;
    }

    currentUser = JSON.parse(userStr);

    // 验证token
    verifyToken().then(valid => {
        if (!valid) {
            window.location.href = '/login';
            return;
        }

        // 初始化页面
        initializePage();
    });
});

// 验证token
async function verifyToken() {
    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// 初始化页面
function initializePage() {
    // 显示用户信息
    document.getElementById('userInfo').textContent = `${currentUser.username} (${getRoleText(currentUser.role)})`;

    // 如果是超级管理员，显示用户管理菜单
    if (currentUser.role === 'super_admin') {
        document.getElementById('userManagementNav').style.display = 'block';
    }

    // 设置导航事件
    setupNavigation();

    // 加载仪表板数据
    showSection('dashboard');
}

// 获取角色文本
function getRoleText(role) {
    const roleMap = {
        'super_admin': '超级管理员',
        'admin': '管理员',
        'user': '普通用户'
    };
    return roleMap[role] || '未知';
}

// 设置导航
function setupNavigation() {
    document.querySelectorAll('.sidebar .nav-link[data-section]').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();

            const section = this.getAttribute('data-section');
            showSection(section);

            // 更新导航状态
            document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// 显示指定部分
async function showSection(section) {
    const mainContent = document.querySelector('.main-content');
    mainContent.innerHTML = '<div class="text-center"><div class="spinner-border"></div></div>';

    try {
        const response = await fetch(`/partials/${section}.html`);
        if (!response.ok) throw new Error('Failed to load section');
        const html = await response.text();
        mainContent.innerHTML = html;

        // 加载并执行相应的JS模块
        loadAndExecuteScript(`/js/${section}.js`);
    } catch (error) {
        mainContent.innerHTML = `<div class="alert alert-danger">Error loading section: ${section}</div>`;
        console.error(error);
    }
}

function loadAndExecuteScript(src) {
    // 移除旧的脚本
    const oldScript = document.querySelector(`script[src="${src}"]`);
    if (oldScript) {
        oldScript.remove();
    }

    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
        // 可选：执行初始化函数
        if (typeof window.initializeSection === 'function') {
            window.initializeSection();
        }
    };
    document.body.appendChild(script);
}

// API请求封装
async function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '请求失败');
    }

    return await response.json();
}

// 退出登录
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}
