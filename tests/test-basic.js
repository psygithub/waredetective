const WarehouseDetective = require('../src/main.js');
const fs = require('fs');
const path = require('path');

async function testBasicFunctionality() {
  console.log('开始基础功能测试...');
  
  try {
    // 测试配置文件加载
    console.log('1. 测试配置文件加载...');
    const detective = new WarehouseDetective();
    console.log('✓ 配置文件加载成功');
    console.log('配置信息:', {
      loginUrl: detective.config.website.loginUrl,
      username: detective.config.website.username,
      hasPassword: !!detective.config.website.password,
      browserSettings: detective.config.browser
    });
    
    // 测试浏览器初始化
    console.log('\n2. 测试浏览器初始化...');
    await detective.init();
    console.log('✓ 浏览器初始化成功');
    
    // 测试页面导航
    console.log('\n3. 测试页面导航...');
    await detective.page.goto('https://www.baidu.com', { waitUntil: 'networkidle' });
    const title = await detective.page.title();
    console.log(`✓ 页面导航成功，页面标题: ${title}`);
    
    // 测试输出目录创建
    console.log('\n4. 测试输出目录...');
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    console.log('✓ 输出目录准备完成');
    
    // 清理
    await detective.close();
    console.log('\n✓ 所有基础功能测试通过！');
    
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    process.exit(1);
  }
}

async function testConfigValidation() {
  console.log('\n开始配置验证测试...');
  
  try {
    const configPath = path.join(__dirname, '../config/config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // 验证必要配置项
    const requiredFields = [
      'website.loginUrl',
      'website.username', 
      'website.password',
      'browser.headless',
      'browser.timeout',
      'output.filename'
    ];
    
    for (const field of requiredFields) {
      const keys = field.split('.');
      let value = config;
      for (const key of keys) {
        value = value[key];
      }
      if (value === undefined || value === null) {
        throw new Error(`缺少必要配置项: ${field}`);
      }
    }
    
    console.log('✓ 配置文件验证通过');
    
    // 验证URL格式
    try {
      new URL(config.website.loginUrl);
      console.log('✓ 登录URL格式正确');
    } catch (e) {
      throw new Error('登录URL格式不正确');
    }
    
  } catch (error) {
    console.error('✗ 配置验证失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
async function runTests() {
  console.log('=== Warehouse Detective 项目测试 ===\n');
  
  await testConfigValidation();
  await testBasicFunctionality();
  
  console.log('\n=== 测试完成 ===');
  console.log('项目已准备就绪，可以开始使用！');
  console.log('\n使用方法:');
  console.log('1. 编辑 config/config.json 添加要搜索的SKU');
  console.log('2. 运行: npm start');
  console.log('3. 或者直接运行: node src/main.js SKU001 SKU002');
}

if (require.main === module) {
  runTests().catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });
}

module.exports = { testBasicFunctionality, testConfigValidation };
