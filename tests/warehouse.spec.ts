
const { test, expect } = require('@playwright/test');
const WarehouseDetective = require('../src/main.js');

test('配置文件加载', async () => {
  const detective = new WarehouseDetective();
  expect(detective.config.website.loginUrl).toBeTruthy();
  expect(detective.config.website.username).toBeTruthy();
  expect(detective.config.website.password).toBeTruthy();
});

test('浏览器初始化', async () => {
  const detective = new WarehouseDetective();
  await detective.init();
  expect(detective.browser).toBeTruthy();
  await detective.close();
});

test('test', async ({ page }) => {
  await page.goto('https://westmonth.com/');
  await page.locator('#layout-header i').nth(3).click();
  await page.getByText('手机登录').click();
  await page.getByRole('textbox', { name: '请输入手机号' }).click();
  await page.getByText('密码登录').click();
  await page.getByRole('textbox', { name: '请输入手机号' }).click();
  await page.getByRole('textbox', { name: '请输入手机号' }).fill('18575215654');
  await page.getByRole('textbox', { name: '请输入密码' }).click();
  await page.getByRole('textbox', { name: '请输入密码' }).fill('rych2025@');
  await page.locator('label span').nth(1).click();
  await page.getByText('登录/注册').click();
  await page.getByRole('searchbox', { name: '请输入商品名称、sku等关键词进行搜索' }).click();
  await page.getByRole('searchbox', { name: '请输入商品名称、sku等关键词进行搜索' }).fill('SOA08-A109-50-WH1');
  await page.getByText('搜索').click();
  const page1Promise = page.waitForEvent('popup');
  await page.locator('.proimg > img:nth-child(2)').click();
  const page1 = await page1Promise;
  await page1.getByText('菲律宾', { exact: true }).click();
  await page1.getByText('库存参考').click();
  let numLc= await page1.locator('.depot-inventory-box > .model-box > .model-right');
  console.log("获取到的库存:");
  console.log(await numLc.textContent());
  await page.waitForTimeout(10000);
});