# 多语言翻译问题修复计划

## 问题概述

网站切换国旗语言后，部分模块翻译不生效或残留旧语言；AI 对话未完全适配 12 种语言。

---

## TODO 清单

### 最高优先级（直接解决翻译不切换问题）

- [x] **A** - 为 10 种语言(ko/fr/ar/sw/th/vi/ms/es/pt/ru)的 common.json 补全 `systems.items`(s1/s2/s3) 和 `projects.items`(p1/p2/p3) 的本地化翻译，替换当前的英文复制内容
- [x] **C1** - 在 12 个 locale 文件中添加新翻译 key：`product.inStock` / `product.reviewCount` / `product.priceUnit` / `cart.submitSuccess` / `cart.submitFailed`
- [x] **C2** - App.tsx 中替换硬编码：`"In Stock"` → t() / `"48条客户评价"` → t() / `"USD/单位"` → t() / `alert("已提交成功")` → t() / `"提交失败"` → t() / api.ts `"未分类"` → "—"
- [x] **D** - CartPage 国家列表 useEffect 依赖从 `[]` 改为 `[i18n.language]`，切换语言时重新请求

### 高优先级（完善翻译体验）

- [x] **B** - 在 zh/common.json 添加 `lang.ar`(阿拉伯语) 和 `lang.sw`(斯瓦希里语)；在 en/common.json 添加 `lang.ar`(Arabic) 和 `lang.sw`(Swahili)
- [x] **E1** - server/index.ts 无 DeepSeek API 时的 fallback 回复从 3 种语言扩展到 12 种语言
- [x] **E3** - server/index.ts 系统 prompt 在非中文界面语言时使用英文版本，减少模型偏向中文输出
- [x] **F** - 重构 useZhSiteOverride 为 useSiteOverride：所有语言都可使用 CMS 返回的本地化数据

### 中优先级（锦上添花）

- [x] **C3** - LanguageFlags 的 aria-label 英文前缀 `"Switch language to"` 已简化为直接使用语言名
- [x] **E2** - server/index.ts `detectUserMessageLang` 添加马来语(ms)和斯瓦希里语(sw)的关键词检测规则
- [x] **E4** - server/index.ts 产品目录格式和工具描述在非中文时使用英文标记（去掉中文括号【】等）

---

## 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `src/locales/ko/common.json` | A, B(无), C1 |
| `src/locales/fr/common.json` | A, C1 |
| `src/locales/ar/common.json` | A, C1 |
| `src/locales/sw/common.json` | A, C1 |
| `src/locales/th/common.json` | A, C1 |
| `src/locales/vi/common.json` | A, C1 |
| `src/locales/ms/common.json` | A, C1 |
| `src/locales/es/common.json` | A, C1 |
| `src/locales/pt/common.json` | A, C1 |
| `src/locales/ru/common.json` | A, C1 |
| `src/locales/zh/common.json` | B, C1 |
| `src/locales/en/common.json` | B, C1 |
| `src/App.tsx` | C2, C3, D, F |
| `src/lib/api.ts` | C2 (未分类 fallback) |
| `server/index.ts` | E1, E2, E3, E4 |

---

## 问题详情

### 问题 A：10 种语言的 systems/projects 未翻译

- 文件：`src/locales/{ko,fr,ar,sw,th,vi,ms,es,pt,ru}/common.json`
- 现象：`systems.items` 和 `projects.items` 是英文原文的复制粘贴
- 只有 `zh` 和 `en` 有正确的本地翻译

### 问题 B：zh 和 en 缺少 lang.ar / lang.sw

- `zh/common.json` 和 `en/common.json` 的 `lang` 对象只到 `vi`
- 缺少 `ar` 和 `sw` 条目，导致国旗 tooltip 异常

### 问题 C：前端硬编码文本

| 位置 | 硬编码 | 应改为 |
|------|--------|--------|
| App.tsx:2834 | `"In Stock"` | `t("product.inStock")` |
| App.tsx:2844 | `"(48 条客户评价)"` | `t("product.reviewCount", {count: 48})` |
| App.tsx:2849 | `"USD / 单位"` | `t("product.priceUnit")` |
| App.tsx:3002 | `alert("已提交成功！...")` | `alert(t("cart.submitSuccess"))` |
| App.tsx:3005 | `"提交失败"` | `t("cart.submitFailed")` |
| api.ts:123 | `"未分类"` | 通过参数传入或通用 fallback |
| App.tsx:125 | `"Switch language to "` | `t("accessibility.switchLang")` |

### 问题 D：购物车国家列表不随语言刷新

- App.tsx:2945-2947 `useEffect(..., [])` 依赖为空
- 切换语言后不重新请求，国家名停留在旧语言

### 问题 E：AI 对话多语言不完善

- E1：无 API Key 时 fallback 只有中/阿/英 3 种语言
- E2：`detectUserMessageLang` 缺少马来语和斯瓦希里语检测
- E3：系统 prompt 全中文，模型容易偏向中文输出
- E4：产品目录用中文括号 `【】`，非中文时不合适

### 问题 F：useZhSiteOverride 逻辑

- App.tsx:1925-1926 `useZhSiteOverride = i18n.language === "zh"`
- 只在中文时使用后台 CMS 配置，其他语言强制回退 t()
- 应改为：API 返回了有效本地化内容就使用，否则才 fallback
