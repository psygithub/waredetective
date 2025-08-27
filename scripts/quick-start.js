#!/usr/bin/env node

const WarehouseDetective = require('../src/main.js');
const fs = require('fs');
const path = require('path');

// 颜色输出函数
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`
};

function showHelp() {
  console.log(colors.cyan('\n=== Warehouse Detective 快速启动工具 ===\n'));
  console.log('使用方法:');
  console.log('  node scripts/quick-start.js [选项] [SKU列表]');
  console.log('\n选项:');
  console.log('  --help, -h          显示帮助信息');
  console.log('  --config, -c        显示当前配置');
  console.log('  --test, -t          运行测试');
  console.log('  --headless          无头模式运行');
  console.log('  --region <地区>     指定搜索地区');
  console.log('\n示例:');
  console.log('  node scripts/quick-start.js SKU001 SKU002');
  console.log('  node scripts/quick-start.js --region 北京 SKU001');
  console.log('  node scripts/quick-start.js --headless SKU001 SKU002');
  console.log('\n配置文件位置: config/config.json');
  console.log('结果输出位置: output/warehouse_results.json\n');
}

function showConfig() {
  try {
    const configPath = path.join(__dirname, '../config/config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    console.log(colors.cyan('\n=== 当前配置 ===\n'));
    console.log(colors.yellow('网站配置:'));
    console.log(`  登录URL: ${config.website.loginUrl}`);
    console.log(`  用户名: ${config.website.username}`);
    console.log(`  密码: ${config.website.password ? '已设置' : '未设置'}`);
    
    console.log(colors.yellow('\n搜索配置:'));
    console.log(`  SKU列表: ${config.search.skus.length > 0 ? config.search.skus.join(', ') : '未设置'}`);
    console.log(`  地区列表: ${config.search.regions.length > 0 ? config.search.regions.join(', ') : '未设置'}`);
    
    console.log(colors.yellow('\n浏览器配置:'));
    console.log(`  无头模式: ${config.browser.headless ? '是' : '否'}`);
    console.log(`  超时时间: ${config.browser.timeout}ms`);
    console.log(`  窗口大小: ${config.browser.viewport.width}x${config.browser.viewport.height}`);
    
    console.log(colors.yellow('\n输出配置:'));
    console.log(`  输出格式: ${config.output.format}`);
    console.log(`  输出文件: ${config.output.filename}\n`);
    
  } catch (error) {
    console.error(colors.red('读取配置文件失败:'), error.message);
  }
}

async function runTest() {
  console.log(colors.cyan('运行项目测试...\n'));
  try {
    const { testBasicFunctionality, testConfigValidation } = require('../tests/test-basic.js');
    await testConfigValidation();
    await testBasicFunctionality();
    console.log(colors.green('\n✓ 所有测试通过！'));
  } catch (error) {
    console.error(colors.red('✗ 测试失败:'), error.message);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // 解析参数
  let skus = [];
  let regions = [];
  let headless = false;
  let i = 0;
  
  while (i < args.length) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      showHelp();
      return;
    } else if (arg === '--config' || arg === '-c') {
      showConfig();
      return;
    } else if (arg === '--test' || arg === '-t') {
      await runTest();
      return;
    } else if (arg === '--headless') {
      headless = true;
    } else if (arg === '--region') {
      i++;
      if (i < args.length) {
        regions.push(args[i]);
      } else {
        console.error(colors.red('错误: --region 需要指定地区名称'));
        process.exit(1);
      }
    } else if (!arg.startsWith('--')) {
      skus.push(arg);
    }
    
    i++;
  }
  
  // 如果没有参数，显示帮助
  if (args.length === 0) {
    showHelp();
    return;
  }
  
  // 如果没有SKU，提示用户
  if (skus.length === 0) {
    console.log(colors.yellow('提示: 没有指定SKU，将使用配置文件中的SKU列表'));
    console.log(colors.blue('如需指定SKU，请使用: node scripts/quick-start.js SKU001 SKU002\n'));
  }
  
  try {
    console.log(colors.cyan('=== 启动 Warehouse Detective ===\n'));
    
    const detective = new WarehouseDetective();
    
    // 如果指定了无头模式，临时修改配置
    if (headless) {
      detective.config.browser.headless = true;
      console.log(colors.yellow('使用无头模式运行\n'));
    }
    
    console.log(colors.blue('配置信息:'));
    console.log(`  目标网站: ${detective.config.website.loginUrl}`);
    console.log(`  用户名: ${detective.config.website.username}`);
    console.log(`  搜索SKU: ${skus.length > 0 ? skus.join(', ') : '使用配置文件'}`);
    console.log(`  搜索地区: ${regions.length > 0 ? regions.join(', ') : '使用配置文件'}`);
    console.log(`  浏览器模式: ${detective.config.browser.headless ? '无头' : '可视'}\n`);
    
    // 开始执行
    await detective.run(skus, regions);
    
    console.log(colors.green('\n✓ 任务完成！'));
    console.log(colors.blue(`结果已保存到: output/${detective.config.output.filename}`));
    
  } catch (error) {
    console.error(colors.red('\n✗ 执行失败:'), error.message);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error(colors.red('\n✗ 未捕获的异常:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(colors.red('\n✗ 未处理的Promise拒绝:'), reason);
  process.exit(1);
});

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { main, showHelp, showConfig, runTest };
