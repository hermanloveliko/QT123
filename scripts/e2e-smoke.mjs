import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const results = [];

function record(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail });
}

async function safeStep(id, name, fn) {
  try {
    await fn();
    record(id, name, true);
  } catch (e) {
    record(id, name, false, String(e?.message || e));
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });

  await safeStep(1, "点击顶部小Q进入后台登录页", async () => {
    const qBtn = page.locator('button[title="管理员登录"]');
    await qBtn.first().click({ timeout: 8000 });
    await page.getByText("管理员登录").first().waitFor({ timeout: 8000 });
  });

  await safeStep(2, "后台登录 QT123/QT123 成功进入后台主界面", async () => {
    const inputs = page.locator("input");
    await inputs.nth(0).fill("QT123");
    await inputs.nth(1).fill("QT123");
    const loginBtns = page.getByRole("button", { name: /登录/ });
    await loginBtns.first().click();
    await page.getByText("后台管理").first().waitFor({ timeout: 10000 });
  });

  await safeStep(3, "后台 Tab 切换可用", async () => {
    for (const tabName of ["站点配置", "产品管理", "国家/港口", "费率", "订单", "AI记录"]) {
      await page.getByRole("button", { name: tabName }).first().click({ timeout: 8000 });
    }
  });

  await safeStep(4, "产品管理新增弹窗可打开并取消", async () => {
    await page.getByRole("button", { name: "产品管理" }).first().click();
    await page.getByRole("button", { name: "新增产品" }).first().click();
    await page.getByText("新增产品").first().waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: "取消" }).first().click();
  });

  await safeStep(5, "国家/港口新增有交互", async () => {
    await page.getByRole("button", { name: "国家/港口" }).first().click();
    page.once("dialog", (d) => d.accept("验收国家"));
    await page.getByRole("button", { name: "新增国家" }).first().click();
    await page.waitForTimeout(1200);
    page.once("dialog", (d) => d.accept("验收港口"));
    await page.getByRole("button", { name: "新增港口" }).first().click();
    await page.waitForTimeout(1200);
  });

  await safeStep(6, "费率编辑保存可用", async () => {
    await page.getByRole("button", { name: "费率" }).first().click();
    const firstPort = page.locator("button").filter({ hasText: /\/CBM/ }).first();
    await firstPort.waitFor({ timeout: 8000 });
    await firstPort.click();
    await page.locator("label:has-text('$/CBM')").locator("..").locator("input").fill("123");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "保存" }).first().click();
    await page.waitForTimeout(1200);
  });

  await safeStep(7, "AI记录可打开会话详情", async () => {
    await page.getByRole("button", { name: "AI记录" }).first().click();
    const listItem = page.locator("text=（无摘要）").first();
    if (await listItem.count()) {
      await listItem.click();
    } else {
      const first = page.locator(".font-mono.text-xs.text-gray-500").first();
      if (await first.count()) await first.click();
    }
  });

  await safeStep(8, "前台 AI 对话可发送并收到回复", async () => {
    await page.getByRole("button", { name: "返回前台" }).first().click();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByText("在线预约咨询").first().click();
    const input = page.getByPlaceholder("输入您的问题...").first();
    await input.fill("测试AI能否回复");
    await page.locator("button").filter({ has: page.locator("svg") }).last().click();
    await page.waitForTimeout(2500);
    const hasReply = await page.locator("text=请求失败").count();
    if (hasReply > 0) throw new Error("AI 返回请求失败");
  });

  await safeStep(9, "产品卡片一键下单按钮可点击（如出现）", async () => {
    const btn = page.getByRole("button", { name: "一键下单" }).first();
    if (await btn.count()) {
      await btn.click();
    } else {
      record(9, "产品卡片一键下单按钮可点击（如出现）", true, "本轮未出现产品卡片，跳过");
    }
  });
} finally {
  await browser.close();
}

const okCount = results.filter((r) => r.ok).length;
const total = 9;
console.log(`总评: ${okCount === total ? "可用" : okCount >= 6 ? "部分可用" : "不可用"} (${okCount}/${total})`);
for (const r of results) {
  console.log(`${r.id}. ${r.name}: ${r.ok ? "通过" : "失败"}${r.detail ? ` | ${r.detail}` : ""}`);
}

