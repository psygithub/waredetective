const { chromium } = require('playwright');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { json } = require('express/lib/response');

class WarehouseDetective {
  constructor() {
    this.config = this.loadConfig();
    this.browser = null;
    this.page = null;
    this.results = [];
    this.mailTransporter = this.createMailTransporter();
  }

  loadConfig() {
    const configPath = path.join(__dirname, '../config/config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  async init() {
    console.log('启动浏览器...');
    this.browser = await chromium.launch({
      headless: this.config.browser.headless,
      viewport: this.config.browser.viewport
    });
    this.page = await this.browser.newPage();
    // await this.page.setViewportSize(this.config.browser.viewport);
  }


  // 创建邮件传输器
  createMailTransporter() {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || this.config.email?.smtpHost,
      port: process.env.SMTP_PORT || this.config.email?.smtpPort || 587,
      secure: process.env.SMTP_SECURE || this.config.email?.smtpSecure || false,
      auth: {
        user: process.env.SMTP_USER || this.config.email?.smtpUser,
        pass: process.env.SMTP_PASS || this.config.email?.smtpPass,
      },
    });
  }


  // 发送邮件（截取整个结果弹窗）
  async sendEmailWithScreenshot_origin(results, skus, regions) {
    try {
      const date = new Date().toLocaleString('zh-CN');
      const subject = `库存检测结果 - ${date}`;

      let htmlContent = `
      <h2>库存检测结果</h2>
      <p>检测时间: ${date}</p>
      <p>检测SKU数量: ${skus.length}</p>
      <p>检测地区数量: ${regions.length}</p>
      <p>总结果数量: ${results.length}</p>
    `;
      let resultsTable = "";
      for (const item of results) {
        resultsTable += `<p>${item.sku}  ${item.region}  ${item.stock}</p>`;
      }
      htmlContent += resultsTable;

      const toList = this.config.email?.to || [];
      if (toList.length === 0) {
        console.log('未配置收件人邮箱，跳过发送邮件');
        return;
      }

      const validEmails = toList.filter(email => email && email.includes('@'));
      if (validEmails.length === 0) {
        console.log('没有有效的收件人邮箱，跳过发送邮件');
        return;
      }


      // ====== 发邮件 ======
      // const mailOptions = {
      //   from: this.config.email?.from,
      //   to: validEmails.join(','),
      //   subject,
      //   html: htmlContent,
      //   attachments: [
      //     {
      //       filename: `inventory-result-${Date.now()}.png`,
      //       path: screenshotPath,
      //       cid: 'screenshot'
      //     }
      //   ]
      // };

      const mailOptions = {
        from: this.config.email?.from,
        to: validEmails.join(','),
        subject,
        html: htmlContent
      };

      await this.mailTransporter.sendMail(mailOptions);
      console.log('邮件发送成功');

      // 删除临时截图文件
      try {
        fs.unlinkSync(screenshotPath);
      } catch (unlinkError) {
        console.warn('删除临时文件失败:', unlinkError.message);
      }
    } catch (error) {
      console.error('发送邮件失败:', error);
    }
  }

  // 发送邮件（截取整个结果弹窗）
  async sendEmailWithScreenshot(results, skus, regions) {
    try {
      const date = new Date().toLocaleString('zh-CN');
      const subject = `库存检测结果 - ${date}`;

      // 计算有库存和无库存的数量
      const inStockCount = results.filter(item =>
        !item.stock.includes('未找到') &&
        !item.stock.includes('无库存') &&
        item.stock.trim() !== ''
      ).length;
      const outOfStockCount = results.length - inStockCount;

      // 美化邮件内容
      let htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>库存检测结果</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9f9f9;
    }
    .header {
      background: linear-gradient(135deg, #2c3e50, #3498db);
      color: white;
      padding: 25px;
      border-radius: 8px 8px 0 0;
      text-align: center;
      margin-bottom: 0;
    }
    .content {
      background-color: white;
      padding: 25px;
      border-radius: 0 0 8px 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .summary {
      margin-bottom: 25px;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .summary-item {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 120px;
      padding: 12px;
      background-color: white;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      text-align: left;
    }
    .summary-label {
      font-size: 13px;
      color: #6c757d;
      margin-bottom: 5px;
      font-weight: 500;
    }
    .summary-value {
      font-size: 18px;
      font-weight: bold;
      color: #2c3e50;
    }
    .summary-value.in-stock {
      color: #28a745;
    }
    .summary-value.out-of-stock {
      color: #dc3545;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #e9ecef;
    }
    th {
      background-color: #f8f9fa;
      font-weight: 600;
      color: #495057;
    }
    tr:hover {
      background-color: #f8f9fa;
    }
    .stock-available {
      color: #28a745;
      font-weight: bold;
    }
    .stock-unavailable {
      color: #dc3545;
      font-weight: bold;
    }
    .footer {
      margin-top: 25px;
      text-align: center;
      font-size: 14px;
      color: #6c757d;
    }
    @media (max-width: 768px) {
      .summary-row {
        flex-direction: column;
      }
      .summary-item {
        min-width: 100%;
      }
      table {
        font-size: 14px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>库存检测结果报告</h1>
    <p>检测时间: ${date}</p>
  </div>
  <div class="content">
    <div class="summary">
      <div class="summary-row">
        <div class="summary-item">
          <span class="summary-label">检测SKU数量</span>
          <span class="summary-value">${skus.length}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">检测地区数量</span>
          <span class="summary-value">${regions.length}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">总结果数量</span>
          <span class="summary-value">${results.length}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">有库存</span>
          <span class="summary-value in-stock">${inStockCount}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">无库存</span>
          <span class="summary-value out-of-stock">${outOfStockCount}</span>
        </div>
      </div>
    </div>
    
    <h2>详细结果</h2>
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>地区</th>
          <th>库存状态</th>
        </tr>
      </thead>
      <tbody>
`;
      // 添加每个结果的表格行
      for (const item of results) {
        const stockClass = item.stock.includes('未找到') ||
          item.stock.includes('无库存') ||
          item.stock.trim() === '' ?
          'stock-unavailable' : 'stock-available';

        htmlContent += `
            <tr>
              <td>${item.sku}</td>
              <td>${item.region}</td>
              <td class="${stockClass}">${item.stock}</td>
            </tr>
      `;
      }

      htmlContent += `
          </tbody>
        </table>
        <div class="footer">
          <p>此邮件由 Warehouse Detective 系统自动生成，请勿直接回复。</p>
        </div>
      </div>
    </body>
    </html>
    `;

      const toList = this.config.email?.to || [];
      if (toList.length === 0) {
        console.log('未配置收件人邮箱，跳过发送邮件');
        return;
      }

      const validEmails = toList.filter(email => email && email.includes('@'));
      if (validEmails.length === 0) {
        console.log('没有有效的收件人邮箱，跳过发送邮件');
        return;
      }


      // ====== 发邮件 ======
      const mailOptions = {
        from: this.config.email?.from,
        to: validEmails.join(','),
        subject,
        html: htmlContent
      };

      await this.mailTransporter.sendMail(mailOptions);
      console.log('邮件发送成功');

    } catch (error) {
      console.error('发送邮件失败:', error);
    }
  }


  async login() {
    console.log('正在登录...');
    try {
      await this.page.goto(this.config.website.loginUrl, {
        waitUntil: 'networkidle',
        timeout: this.config.browser.timeout
      });

      // 等待页面加载完成
      await this.page.waitForTimeout(2000);
      console.log('打开页面...');
      await this.page.locator('#layout-header i').nth(3).click();
      await this.page.getByText('手机登录').click();
      await this.page.getByRole('textbox', { name: '请输入手机号' }).click();
      await this.page.getByText('密码登录').click();
      await this.page.getByRole('textbox', { name: '请输入手机号' }).click();
      await this.page.getByRole('textbox', { name: '请输入手机号' }).fill(this.config.website.username);
      await this.page.getByRole('textbox', { name: '请输入密码' }).click();
      await this.page.getByRole('textbox', { name: '请输入密码' }).fill(this.config.website.password);
      console.log('点击同意...');
      await this.page.locator('label span').nth(1).click();
      await this.page.getByText('登录/注册').click();
      return true;
    } catch (error) {
      console.error('登录过程中出错:', error);
      return false;
    }
  }

  async searchSkuList(skuList, regionList) {
    const results = [];

    for (const sku of skuList) {
      if (regionList.length > 0) {
        for (const region of regionList) {
          const result = await this.searchSKU(sku, region);
          if (result) {
            results.push(...result);
          }
          await this.page.waitForTimeout(1000); // 添加延迟避免请求过快
        }
      } else {
        const result = await this.searchSKU(sku);
        if (result) {
          results.push(...result);
        }
        await this.page.waitForTimeout(1000); // 添加延迟避免请求过快
      }
    }

    try {

      // 发送邮件 - 修复：使用 results 而不是 this.results
      await this.sendEmailWithScreenshot(results, skuList, regionList,);
    } catch (error) {
      console.error('截图发送邮件过程中出错:', error);
      return results;

    }



    return results;
  }
  async searchSKU(sku, region = '') {
    console.log(`搜索SKU: ${sku}, 地区: ${region || '全部'}`);

    try {
      // 清空搜索框并输入SKU
      await this.page.getByRole('searchbox', { name: '请输入商品名称、sku等关键词进行搜索' }).click();
      await this.page.getByRole('searchbox', { name: '请输入商品名称、sku等关键词进行搜索' }).fill('');
      await this.page.getByRole('searchbox', { name: '请输入商品名称、sku等关键词进行搜索' }).fill(sku);
      console.log(`已输入SKU: ${sku}`);

      // 点击搜索按钮
      await this.page.getByText('搜索').click();

      // 等待搜索结果加载
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(3000);

      // 等待真实商品图片加载，而不是占位符
      console.log('等待真实商品图片加载...');

      // 使用更智能的等待策略
      await this.page.waitForFunction(() => {
        const images = document.querySelectorAll('.proimg img');
        if (images.length === 0) return false;

        // 检查是否有非占位符的真实图片
        return Array.from(images).some(img => {
          const src = img.src || '';
          return !src.includes('商品正在加载时.png') && !src.includes('newImage');
        });
      }, { timeout: 30000 });

      // 使用 page.$$ 获取元素句柄而不是 $$eval
      const productImages = await this.page.$$('.proimg img');
      if (productImages.length === 0) {
        console.log('未找到商品图片');
        return null;
      }

      // 过滤掉占位符图片
      const validImages = [];
      for (const imgHandle of productImages) {
        const src = await imgHandle.getAttribute('src');
        if (src && !src.includes('商品正在加载时.png') && !src.includes('newImage')) {
          validImages.push(imgHandle);
        }
      }

      if (validImages.length === 0) {
        console.log('未找到真实商品图片，只有占位符');

        // 尝试另一种选择器或等待更长时间
        await this.page.waitForTimeout(5000);
        const fallbackImages = await this.page.$$('.proimg img:not([src*="加载"])');
        if (fallbackImages.length === 0) {
          console.log('确实没有找到商品');
          return null;
        }

        // 点击第一个非占位符图片
        await fallbackImages[0].click();
      } else {
        // 点击第一个真实商品图片
        console.log('找到真实商品图片，准备点击');
        await validImages[0].click();
      }

      console.log('已点击商品图片');

      // 等待新页面弹出
      const page1 = await this.page.waitForEvent('popup', { timeout: 60000 });
      console.log('已打开商品详情页');

      // 设置新页面的超时时间
      page1.setDefaultTimeout(60000);

      // 等待新页面加载完成
      await page1.waitForLoadState('domcontentloaded');
      await page1.waitForTimeout(3000);

      // 选择地区
      try {
        const regionButton = page1.getByText(region, { exact: true });
        await regionButton.waitFor({ state: 'visible', timeout: 10000 });
        await regionButton.click();
        console.log('已选择地区: ' + region);
      } catch (error) {
        console.log('选择地区失败，可能已经默认选择或地区不可用:', error.message);
      }

      // 点击库存参考
      try {
        const stockButton = page1.getByText('库存参考');
        await stockButton.waitFor({ state: 'visible', timeout: 10000 });
        await stockButton.click();
        console.log('已点击库存参考');
      } catch (error) {
        console.log('点击库存参考失败:', error.message);
      }

      // 等待库存信息加载
      await page1.waitForTimeout(5000);

      // 尝试多种选择器来获取库存信息
      let stockNum = '未找到结果';
      const stockSelectors = [
        '.depot-inventory-box > .model-box > .model-right'
        // ,
        // '.model-right',
        // '[class*="inventory"]',
        // '[class*="stock"]',
        // '.ant-table-cell' // 可能是表格形式的库存显示
      ];

      for (const selector of stockSelectors) {
        try {
          const stockElement = page1.locator(selector).first();
          await stockElement.waitFor({ state: 'visible', timeout: 5000 });
          stockNum = await stockElement.textContent();
          if (stockNum && stockNum.trim() !== '') {
            console.log("使用选择器", selector, "获取到的库存:", stockNum);
            break;
          }
        } catch (error) {
          // 继续尝试下一个选择器
          continue;
        }
      }

      // 获取商品图片
      let imgSrc = '';
      try {
        const imgLocator = page1.locator('.imgView__item > img').first();
        await imgLocator.waitFor({ state: 'visible', timeout: 5000 });
        imgSrc = await imgLocator.getAttribute('src');
        console.log('图片地址:', imgSrc);
      } catch (error) {
        console.log('获取图片地址失败:', error.message);
      }

      const items = [{
        sku,
        region: region || '全部',
        stock: stockNum || '未找到结果',
        lastUpdated: new Date().toISOString(),
        img: imgSrc || '',
        url: page1.url()
      }];

      // 关闭新页面
      await page1.close();
      return items;

    } catch (error) {
      console.error(`搜索SKU ${sku} 时出错:`, error.message);

      // 尝试捕获当前页面的截图以便调试
      try {
        const screenshotPath = `error_${sku}_${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath });
        console.log(`错误截图已保存到: ${screenshotPath}`);
      } catch (screenshotError) {
        console.log('无法保存错误截图:', screenshotError.message);
      }

      return null;
    }
  }

  async searchByLink(link, region) {

  }
  async saveResults() {
    const outputPath = path.join(__dirname, '../output', this.config.output.filename);

    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const output = {
      timestamp: new Date().toISOString(),
      totalResults: this.results.length,
      results: this.results
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`结果已保存到: ${outputPath}`);
  }

  //保存到sqlite
  async saveResultsToDb(userId, configId, skus, regions, results, status = 'completed', isScheduled = false, scheduleId = null) {
    const now = new Date().toISOString();
    const resultData = {
      userId,
      configId,
      skus,
      regions,
      results: this.results,
      status,
      isScheduled,
      scheduleId
    };

    try {
      const savedResult = database.saveResult(resultData);
      console.log('结果已保存到SQLite数据库，ID:', savedResult.id);
      return savedResult;
    } catch (error) {
      console.error('保存到数据库失败:', error);
      throw error;
    }
  }


  async run(skus = [], regions = [], userId = null, configId = null, isScheduled = false, scheduleId = null) {
    try {
      await this.init();

      const loginSuccess = await this.login();
      if (!loginSuccess) {
        console.log('登录失败，程序终止');
        return;
      }
      //return;

      // 如果没有提供SKU列表，使用配置文件中的
      const skuList = skus.length > 0 ? skus : this.config.search.skus;
      const regionList = regions.length > 0 ? regions : this.config.search.regions;

      if (skuList.length === 0) {
        console.log('没有要搜索的SKU，请在配置文件中添加或作为参数传入');
        return;
      }

      console.log(`开始搜索 ${skuList.length} 个SKU...`);

      for (const sku of skuList) {
        if (regionList.length > 0) {
          for (const region of regionList) {
            const result = await this.searchSKU(sku, region);
            if (result) {
              this.results.push(...result);
              console.log('已找到: ' + JSON.stringify(result));
            }
            await this.page.waitForTimeout(1000); // 避免请求过快
          }
        } else {
          const result = await this.searchSKU(sku);
          if (result) {
            this.results.push(...result);
          }
          await this.page.waitForTimeout(1000);
        }
      }

      let screenshotPath = null;
      // 保存截图
      screenshotPath = path.join(__dirname, '../temp', `screenshot-${Date.now()}.png`);
      // 确保临时目录存在
      const tempDir = path.dirname(screenshotPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }


      // 发送邮件
      await this.sendEmailWithScreenshot(this.results, skuList, regionList);


      // 保存到数据库
      if (userId) {
        await this.saveResultsToDb(userId, configId, skuList, regionList, 'completed', isScheduled, scheduleId);
      } else {
        await this.saveResults(); // 保存到文件作为备份
      }
      console.log('搜索完成！');

    } catch (error) {
      console.error('运行过程中出错:', error);
      // 可以在这里保存错误状态到数据库
      if (userId) {
        try {
          await this.saveResultsToDb(userId, configId, skus, regions, 'failed', isScheduled, scheduleId);
        } catch (dbError) {
          console.error('保存错误状态到数据库失败:', dbError);
        }
      }
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  showResultsView(results) {
    let html = `
    <div class="modal fade show" id="resultModal" style="display:block; position:fixed; top:10%; left:5%; width:90%; z-index:9999;">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">检测结果详情</h5>
          </div>
          <div class="modal-body">
    `;

    if (results && results.length > 0) {
      html += `
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>SKU</th>
              <th>地区</th>
              <th>库存</th>
            </tr>
          </thead>
          <tbody>
    `;
      results.forEach(item => {
        html += `
        <tr>
          <td>${item.sku}</td>
          <td>${item.region}</td>
          <td>
            <span style="color:${item.stock.includes('未找到') ? 'red' : 'green'}">
              ${item.stock}
            </span>
          </td>
        </tr>
      `;
      });
      html += `</tbody></table></div>`;
    } else {
      html += `<p class="text-muted">暂无结果数据</p>`;
    }

    html += `
          </div>
        </div>
      </div>
    </div>
   `;
    return html;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}







// 如果直接运行此文件
if (require.main === module) {
  const detective = new WarehouseDetective();

  // 从命令行参数获取SKU和地区
  const args = process.argv.slice(2);
  const skus = args.filter(arg => !arg.startsWith('--'));

  detective.run(skus).then(() => {
    console.log('程序执行完成');
  }).catch(error => {
    console.error('程序执行失败:', error);
  });
}

module.exports = WarehouseDetective;
