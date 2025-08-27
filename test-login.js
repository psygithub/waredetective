const bcrypt = require('bcryptjs');

async function testLogin() {
    const storedPassword = '$2b$10$nenUxT.khHJKawdG6CNA.elLjZkOSg6t2zX3SYbKztbrexVtj0ORi';
    const inputPassword = 'admin123';
    
    console.log('测试密码验证...');
    console.log('输入密码:', inputPassword);
    console.log('存储的哈希:', storedPassword);
    
    const isValid = await bcrypt.compare(inputPassword, storedPassword);
    console.log('密码验证结果:', isValid);
    
    // 测试API调用
    console.log('\n测试API调用...');
    try {
        const response = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123'
            })
        });
        
        console.log('响应状态:', response.status);
        const data = await response.json();
        console.log('响应数据:', data);
        
    } catch (error) {
        console.error('API调用错误:', error.message);
    }
}

testLogin();
