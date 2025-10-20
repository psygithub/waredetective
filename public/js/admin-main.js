// 全局变量
let currentUser = null;
let token = null;
let sessionCheckInterval = null; // 用于会话检查的定时器

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

// 开始会话轮询检查
function startSessionCheck() {
    // 先停止任何可能存在的旧定时器
    stopSessionCheck();
    
    sessionCheckInterval = setInterval(async () => {
        try {
            const baseUrl = window.location.origin;
            const fullUrl = new URL('/api/auth/check-session', baseUrl).href;
            const response = await fetch(fullUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.status === 401) {
                // 如果会话失效，则登出
                console.log('会话已失效，将自动登出。');
                logout();
            }
        } catch (error) {
            console.error('会话检查失败:', error);
            // 可以在这里添加一些网络错误处理逻辑
        }
    }, 10000); // 每10秒检查一次
}

// 停止会话轮询检查
function stopSessionCheck() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
    }
}

// 验证token
async function verifyToken() {
    try {
        const baseUrl = window.location.origin;
        const fullUrl = new URL('/api/auth/verify', baseUrl).href;
        const response = await fetch(fullUrl, {
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
    // 检查用户角色 - 只有管理员可以访问此页面
    if (currentUser.role !== 'admin') {
        document.body.innerHTML = ''; // 如果不是管理员，直接清空页面
        return; // 停止所有后续脚本执行
    }

    // 显示用户信息
    document.getElementById('userInfo').textContent = `${currentUser.username} (${getRoleText(currentUser.role)})`;

    // 设置导航事件
    setupNavigation();

    // 加载仪表板数据
    showSection('dashboard');

    // 启动会话检查
    startSessionCheck();
}

// 获取角色文本
function getRoleText(role) {
    const roleMap = {
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
        await loadAndExecuteScript(`/js/${section}.js`);
        
        // 确保在脚本加载后执行初始化函数
        if (typeof window.initializeSection === 'function') {
            window.initializeSection();
        }
    } catch (error) {
        mainContent.innerHTML = `<div class="alert alert-danger">Error loading section: ${section}</div>`;
        console.error(error);
    }
}

function loadAndExecuteScript(src) {
    return new Promise((resolve, reject) => {
        // 移除所有之前动态加载的模块脚本
        document.querySelectorAll('script[data-section-script]').forEach(s => s.remove());

        const script = document.createElement('script');
        // 添加时间戳作为查询参数以防止浏览器缓存 (cache busting)
        script.src = `${src}?v=${new Date().getTime()}`;
        // 添加一个自定义属性来标识这些动态加载的脚本
        script.dataset.sectionScript = 'true';
        
        script.onload = () => {
            console.log(`脚本 ${src} 加载完成。`);
            resolve();
        };
        
        script.onerror = () => {
            console.error(`脚本 ${src} 加载失败。`);
            reject(new Error(`Script load error for ${src}`));
        };

        document.body.appendChild(script);
    });
}

// API请求封装
async function apiRequest(url, method = 'GET', data = null) {
    const baseUrl = window.location.origin;
    const fullUrl = new URL(url, baseUrl).href;

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

    const response = await fetch(fullUrl, options);

    if (response.status === 401) {
        // 捕获到401错误，立即登出
        console.log('API请求认证失败，将自动登出。');
        logout();
        // 抛出一个错误以中断当前的Promise链
        throw new Error('会话已失效');
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '请求失败');
    }

    // 检查响应是否为空
    const text = await response.text();
    return text ? JSON.parse(text) : {};
}

// 退出登录
function logout() {
    // 停止会话检查
    stopSessionCheck();

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}
