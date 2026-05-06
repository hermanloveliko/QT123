/**
 * 本地 SEO 自检：用 Playwright 拉取若干页面，打印 title / meta description / keywords。
 * 用法：先 npm run dev（默认 http://localhost:3000），再 npm run seo:check
 * 指定站点：SEO_BASE_URL=https://www.qingtai-group.store node scripts/check-seo.mjs
 */
import { chromium } from "playwright";

const base = String(process.env.SEO_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const extra = process.env.SEO_EXTRA_URLS ? JSON.parse(process.env.SEO_EXTRA_URLS) : [];
const sampleProduct =
  process.env.SEO_SAMPLE_PRODUCT_PATH ||
  "/products/item/cmoictoom00whcq9qpxs7yejy";

const urls = [
  `${base}/?lang=en`,
  `${base}/products/?lang=en`,
  `${base}/aluminum-ceiling/?lang=en`,
  `${base}/acoustic-panels/?lang=en`,
  `${base}/building-boards/?lang=en`,
  `${base}/ceiling-accessories/?lang=en`,
  `${base}${sampleProduct.startsWith("/") ? sampleProduct : `/${sampleProduct}`}?lang=en`,
  ...extra,
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

for (const url of urls) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await new Promise((r) => setTimeout(r, 1200));
  const data = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
    keywords: document.querySelector('meta[name="keywords"]')?.getAttribute("content") || "",
  }));
  console.log(`\nURL: ${url}`);
  console.log(`TITLE: ${data.title}`);
  console.log(`DESCRIPTION: ${data.description}`);
  console.log(`KEYWORDS: ${data.keywords}`);
}

await browser.close();
