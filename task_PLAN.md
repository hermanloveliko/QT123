# 青泰项目 · 循环任务计划（给 Cursor 新对话用）

> **用途**：每次新开对话时，先读本文件，按阶段执行；做完当前阶段后更新本文「状态」区，便于下一轮继续循环。

---

## 0. 开场必读（每个新对话第一步）

1. 阅读本文件全文，尤其 **当前状态** 与 **下一阶段**。
2. 阅读 `docs/requirements-map.md`（需求 ↔ 实现对照）。
3. 若改代码：遵守仓库现有风格；小步提交式修改，避免无关重构。

---

## 1. 项目速览

| 层级 | 说明 |
|------|------|
| 前台 | `src/App.tsx`（主站）、`src/main.tsx`（`/admin` 走 `AdminApp`） |
| API | `server/index.ts`，默认端口见 `API_PORT` / `8787` |
| 数据库 | Prisma：`prisma/schema.prisma`，种子 `prisma/seed.ts` |
| 公共请求 | `src/lib/api.ts`（`apiJson`、`toLegacyProduct` 等） |

本地典型启动：终端 `npm run dev:api` + `npm run dev`。

---

## 2. 固定循环流程（每轮对话建议按序做）

### 阶段 A — 对齐现状（只读）

- [ ] `README.md`、`.env.example` 与真实运行方式是否一致。
- [ ] `docs/requirements-map.md` 中标记的缺口是否已在代码里补上。
- [ ] 前台是否仍混用静态数据与 API（产品、站点配置、购物车报价等）。

**产出**：用 3～5 句话写在本文底部 **会话记录**（日期 + 结论）。

### 阶段 B — 选一项「可验收」的改动（写代码）

每次对话**只做一类**改动，例如：

- 产品目录 / 购物车 / 站点 CMS / AI / 后台路由 / 文档  
- 或修一个具体 bug（附复现步骤）

**完成标准**：

- `npm run lint` 通过（若项目有则再跑测试）。
- 涉及 API 时说明需同时起 API + 前端验证的路径。

### 阶段 C — 更新本计划（闭环）

在 **当前状态** 里勾选/改写；在 **会话记录** 追加一行；若发现长期事项，写入 **待办池**。

---

## 3. 当前状态（由 Cursor / 人工维护）

**最近一次更新**：2026-04-07

| 项 | 状态 |
|----|------|
| 需求文档 `docs/requirements-map.md` | ☑ 已通读 ☐ 已对照代码更新 |
| 前台产品数据来自 `/api/public/products` | ☑ 是 ☐ 否 / 部分 |
| 站点配置前台可读 `GET /api/public/site-settings` | ☑ 已接前台 ☐ 未接 |
| 购物车 USD + 报价预览 `POST /api/public/quote` | ☑ 已接 ☐ 未接 |
| `/admin` 与主站后台一致性 | ☑ 一致（`AdminApp` 传入 `initialPage="admin"`） |
| README / 环境变量说明 | ☐ 准确 ☐ 待改（未在本次改动） |
| 后台「站点配置」表单/对话框编辑（替代纯 JSON） | ☑ 已完成（`SiteSettingEditDialog` + `src/admin/site-settings-forms.tsx`；未知 key / 新建走「高级 · JSON」） |
| 多语言：Hero 红框国旗切换（移动端可横滑） | ☑ 已加（同步 `?lang=` + localStorage + `dir`） |
| 多语言：修复切语言不刷新（模块级硬编码） | ☑ 关键数据（系统方案/工程案例/加载态）已迁移到 `t()`，随语言变化刷新 |

**下一阶段优先做（只填 1 条）**：

> **全量多语言 + 首页国旗切换**：支持 `zh/en/fr/es/pt/ru/ko/ms/th/vi`；前端 UI 文案 i18n；后端/DB/后台支持内容多语言（产品/分类/国家港口/站点配置）；首页 Hero 红框位置加国旗切换器（移动端也显示，横向可滚动）。

---

## 4. 待办池（ backlog，按优先级从上往下）

_从需求对照表或讨论中摘抄，完成一条划掉或移到「会话记录」_

1. ~~**后台站点配置 UI**~~：已由 `src/admin/site-settings-forms.tsx` + `AdminSettingsTab` 弹窗表单完成。
2. **文档与环境**：`README.md`、`.env.example` 与真实端口（Vite 常因 3000 占用落到 3001、`API_PORT` 8787）及 `VITE_API_BASE` 说明对齐；`docs/requirements-map.md` 对照代码更新勾选/缺口描述。
3. **全量多语言（后台可编辑）+ 首页国旗切换**（`zh/en/fr/es/pt/ru/ko/ms/th/vi`，追加 `ar/sw`）：\n+   - **语言契约**：统一语言代码、回退策略；前端通过 `?lang=` 或 `Accept-Language` 传递（建议 query 优先）。\n+   - **数据库**：为 `Product/Category/Subcategory/Country/Port/SiteSetting` 增加 `*I18n` 翻译表（推荐独立表），并把现有字段回填到默认语言（`zh`）。\n+   - **后端 API**：`/api/public/products`、`/api/public/site-settings`、国家/港口等按 lang 输出“当前语言视图”，缺失走 fallback；必要时提供兼容字段。\n+   - **后台 UI**：产品/分类/港口/站点配置支持语言切换编辑、并排编辑、复制默认语言到当前语言；默认语言必填。\n+   - **前端 UI i18n（固定文案全量覆盖）**：修复“只首页变化”的根因——把 `src/App.tsx` 等处硬编码文案迁移到 `i18next/react-i18next`（`t()`/`Trans`），覆盖导航、首页各区块、目录页（分类/排序/空态/加载）、案例/详情页、关于页、弹窗/提示等；避免把翻译文案写成模块级常量（否则切语言不刷新）。\n+   - **动态数据 + i18n 策略**：产品分类/名称/描述/规格来自 API 时，明确多语言字段契约（推荐后端按 lang 返回当前语言视图，前端仅展示；或前端维护映射表作为临时方案），保证分类筛选在切语言后仍可用。\n+   - **新增语言**：新增阿拉伯语 `ar` 与斯瓦希里语 `sw`：补齐 `SUPPORTED_LANGS`、`src/i18n/index.ts` resources、语言切换 UI、资源文件 `src/locales/ar/common.json`、`src/locales/sw/common.json`；并处理阿语 `dir="rtl"` 与字体/排版适配。\n+   - **首页国旗按钮**：Hero 红框位置增加国旗条（移动端也显示、横向可滚动），点击切换语言；旗帜映射已确认：`en=UK`、`es=ES`、`pt=PT`、`ms=MY`，其余建议 `zh=CN`、`fr=FR`、`ru=RU`、`ko=KR`、`th=TH`、`vi=VN`（`ar/sw` 待定）；优先用本地 SVG/PNG 资源。\n+   - **回归验收**：切换语言后 Home/Catalog/Projects/About/SystemDetail/ProjectDetail/弹窗等页面文案同步变化、刷新保持；跑 `npm run lint` 通过。

**本阶段 TO DO LIST（落地清单）**：

- [ ] **统一 12 语言**：后端 `server/index.ts` 与 Prisma `Lang` 枚举统一为 `zh/en/fr/es/pt/ru/ko/ms/th/vi/ar/sw`，并说明迁移方式（优先 `prisma db push`，避免 shadow DB 权限）。
- [ ] **公共接口动态数据全量本地化**：确保 `/api/public/products`（含 category/subcategory）、`/api/public/countries`、`/api/public/ports`、`/api/public/site-settings` 都按 `lang` 输出当前语言视图，缺失走 fallback。
- [ ] **后台批量初始化 i18n（核心）**：新增 Admin 批量 API：\n  - `empty`：一键生成空翻译记录（不覆盖已有）；\n  - `copyZh`：把中文复制到目标语言（便于后续人工修改）；\n  - `machine`：调用 DeepSeek 机器翻译预填（再人工校对）。\n  覆盖：`siteSettings/products/categories/subcategories/countries/ports`。
- [ ] **站点配置（JSON）批量翻译**：对 `PUBLIC_SITE_SETTING_KEYS` 的 Json 递归翻译字符串字段（保留 URL/ID/数字），写入 `SiteSettingI18n`。
- [ ] **后台 UI 增强**：在后台各模块（站点配置/产品/分类/国家港口）增加批量按钮与结果提示（成功/跳过/失败），按当前编辑语言 `editLang` 执行。
- [ ] **数据初始化与验收**：用 fr/es 等语言验证你截图圈出的区域（咨询模块、系统/案例、物流追踪、footer、catalog 侧栏/排序、产品卡片标题/分类/specs、国家/港口下拉）均随语言变化；`npm run lint` 通过。

_已完成、不必再记待办：购物车「确认信息并提交订单」后右侧展示报价并写入后台订单（见 `CartPage`）。_

---

## 5. 会话记录（倒序追加，新对话先看最新一条）

| 日期 | 摘要 |
|------|------|
| 2026-04-07（多语言切换修复） | 完成 Hero 红框国旗切换器：点击切语言后同步写入 `localStorage`、更新 `document` 的 `lang/dir`，并把 URL `?lang=` 置为当前语言以便刷新保持。修复“切语言不刷新”的核心根因：把 `SYSTEMS/PROJECTS/FALLBACK_PRODUCT` 从模块级中文常量改为随 `t()` 生成的本地化数据；并补齐各语言 `common.json` 的 `common.loading`、`systems.items.*`、`projects.items.*`，避免显示 key。`npm run lint` 通过。 |
| 2026-04-07（批量 i18n 落地） | 后端新增 `POST /api/admin/i18n/batch` 支持 `siteSettings/products/categories/subcategories/countries/ports` 的批量初始化：`empty/copyZh/machine(DeepSeek)`；站点配置支持 Json 递归翻译字符串。后台 UI 在「站点配置/产品管理/国家港口」增加批量按钮。已用 `fr/es` 批量机器翻译并通过公共接口验证：`/api/public/site-settings?lang=fr`、`/api/public/products?lang=fr`、`/api/public/countries?lang=fr`、`/api/public/ports?...&lang=fr` 返回已本地化内容。`npm run lint` 通过。 |
| 2026-04-07（多语言规划） | 确认需求为 **全量多语言 + 后台可编辑**，语言 `zh/en/fr/es/pt/ru/ko/ms/th/vi`；首页 Hero 红框位置加国旗切换器（移动端也显示、横向可滚动）。旗帜映射确认：`en=UK`、`es=ES`、`pt=PT`、`ms=MY`。下一步按待办 3 落地：语言契约→DB i18n→API 本地化→后台多语言编辑→前端 i18next + 国旗按钮。 |
| 2026-04-07（站点配置表单） | 新增 `src/admin/site-settings-forms.tsx`：`contact`、`home.consultation`、`home.systems`/`projects`（可增删项）、`home.logistics`、`footer`、`catalog.customSpec` 用对话框表单编辑；其余 key 在弹窗内 JSON；列表侧保留「高级 · JSON 新建」。`AdminSettingsTab` 改为列表 + 编辑按钮，保存仍 `PUT /api/admin/site-settings/:key`。`npm run lint`（tsc）通过。 |
| 2026-04-07（续） | **未完成已记入待办池**：用户要求后台「站点配置」由 JSON 改为固定对话框+表单填写保存——**未落地**（仍为 JSON 编辑区）。另：产品管理上传/API、航线 seed、购物车改为「确认后一次性提交订单+右侧报价」等已在当轮对话处理；若有遗漏以代码为准。 |
| 2026-04-07 | 阶段 A：确认上次 `App.tsx` 存在与 `lib/api` 重复的 `apiJson`/`ApiProduct` 等定义，且 `PROJECTS`/`PRODUCTS` 命名断裂。阶段 B：删除重复实现；`PROJECTS` 数组命名统一；目录页从 `GET /api/public/products` 拉取并支持分类/排序；首页/案例/物流/咨询区绑定 `GET /api/public/site-settings`；Footer、联系弹窗绑定 `footer`/`contact`；目录侧栏「联系定制」走站点 `catalog.customSpec` 并打开联系弹窗；购物车必填含姓名+电话，自动 `POST /api/public/quote` 展示 USD/CBM，单价与小计改 USD；详情页多图 `gallery` + USD；`App` 支持 `initialPage` 修复 `AdminApp`。`npm run lint` 通过。 |
| | |

---

## 6. 给 Cursor 的显式指令模板（可复制到新对话）

```text
请先阅读仓库根目录 task_PLAN.md，执行「阶段 A」，然后按「下一阶段优先做」完成阶段 B，最后更新 task_PLAN.md 的当前状态与会话记录。
```

---

## 7. 注意事项

- 不要假设用户已配置 PostgreSQL；改 DB 结构时说明 `migrate` / `db push` / `seed`。
- 密钥仅放 `.env`，勿写入仓库。
- 大文件 `App.tsx` 修改前先 `grep` 定位，避免整文件无差别重写。
