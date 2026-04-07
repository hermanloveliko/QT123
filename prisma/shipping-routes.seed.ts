/**
 * 上海港出口航线运价种子数据
 *
 * 来源：用户提供的「上海港出口至全球各航线港口及运价明细表」
 * 有效期参考：2026-04-01 ~ 2026-04-15（SCFI/平台整理）
 *
 * 后台计费模型为「USD / CBM」，表中为「USD / 集装箱」。折算约定（行业粗算，便于拼箱/散货估算）：
 * - 20尺 TEU：整箱价 ÷ 28（m³）
 * - 40尺 FEU：整箱价 ÷ 67（m³）
 *
 * 波斯湾等标注「名义价、成交少」的航线仍注入，备注中说明；非洲等宽幅区间取代表值并备注。
 */

import type { PrismaClient } from "@prisma/client";

const TEU_CBM = 28;
const FEU_CBM = 67;

function perTeu(usd: number): number {
  return Math.round((usd / TEU_CBM) * 100) / 100;
}
function perFeu(usd: number): number {
  return Math.round((usd / FEU_CBM) * 100) / 100;
}

type PortRow = { country: string; port: string; usdPerCbm: number; note: string };

function buildPortRows(): PortRow[] {
  const n = (s: string) => s;
  const rows: PortRow[] = [];

  const euNote = n("欧洲基港 SCFI 20'≈1650USD");
  const eu = perTeu(1650);
  for (const [country, port] of [
    ["荷兰", "Rotterdam"],
    ["德国", "Hamburg"],
    ["德国", "Bremen"],
    ["比利时", "Antwerp"],
    ["比利时", "Zeebrugge"],
    ["法国", "Le Havre"],
    ["英国", "Felixstowe"],
    ["英国", "Southampton"],
  ] as const) {
    rows.push({ country, port, usdPerCbm: eu, note: euNote });
  }

  const medNote = n("地中海基港 SCFI 20'≈2684USD");
  const med = perTeu(2684);
  for (const [country, port] of [
    ["西班牙", "Barcelona"],
    ["西班牙", "Valencia"],
    ["意大利", "Genoa"],
    ["意大利", "Naples"],
    ["意大利", "Venice"],
    ["希腊", "Piraeus"],
    ["土耳其", "Istanbul"],
    ["法国", "Marseille"],
    ["埃及", "Alexandria"],
    ["黎巴嫩", "Beirut"],
  ] as const) {
    rows.push({ country, port, usdPerCbm: med, note: medNote });
  }

  const uswNote = n("美西基港 SCFI 40'≈2359USD");
  const usw = perFeu(2359);
  for (const port of [
    "Los Angeles",
    "Long Beach",
    "Oakland",
    "Seattle",
    "Portland OR",
    "San Diego",
  ]) {
    rows.push({ country: "美国", port, usdPerCbm: usw, note: uswNote });
  }

  const useNote = n("美东基港 SCFI 40'≈3354USD");
  const use = perFeu(3354);
  for (const port of [
    "New York",
    "Savannah",
    "Norfolk",
    "Charleston",
    "Miami",
    "Jacksonville",
    "Baltimore",
    "Boston",
    "Philadelphia",
  ]) {
    rows.push({ country: "美国", port, usdPerCbm: use, note: useNote });
  }

  const pgNote = n("波斯湾 20'≈3977USD(名义价参考)");
  const pg = perTeu(3977);
  for (const [country, port] of [
    ["阿联酋", "Dubai"],
    ["阿联酋", "Abu Dhabi"],
    ["沙特阿拉伯", "Dammam"],
    ["卡塔尔", "Doha"],
    ["科威特", "Kuwait"],
    ["巴林", "Bahrain"],
    ["伊朗", "Bandar Abbas"],
  ] as const) {
    rows.push({ country, port, usdPerCbm: pg, note: pgNote });
  }

  const saNote = n("南美基港 SCFI 20'≈2609USD");
  const sa = perTeu(2609);
  for (const [country, port] of [
    ["巴西", "Santos"],
    ["巴西", "Rio de Janeiro"],
    ["巴西", "Paranagua"],
    ["巴西", "Sao Francisco do Sul"],
    ["阿根廷", "Buenos Aires"],
    ["阿根廷", "Puerto Madryn"],
    ["乌拉圭", "Montevideo"],
    ["智利", "Valparaiso"],
    ["秘鲁", "Callao"],
    ["哥伦比亚", "Buenaventura"],
  ] as const) {
    rows.push({ country, port, usdPerCbm: sa, note: saNote });
  }

  const anzNote = n("澳新 SCFI 20'≈794USD");
  const anz = perTeu(794);
  for (const port of ["Sydney", "Melbourne", "Brisbane", "Adelaide", "Fremantle"]) {
    rows.push({ country: "澳大利亚", port, usdPerCbm: anz, note: anzNote });
  }
  for (const port of ["Auckland", "Lyttelton"]) {
    rows.push({ country: "新西兰", port, usdPerCbm: anz, note: anzNote });
  }

  const seaNote = n("东南亚 SCFI 20'≈515USD");
  const sea = perTeu(515);
  for (const [country, port] of [
    ["新加坡", "Singapore"],
    ["马来西亚", "Port Klang"],
    ["马来西亚", "Penang"],
    ["马来西亚", "Kuantan"],
    ["泰国", "Laem Chabang"],
    ["越南", "Ho Chi Minh City"],
    ["越南", "Haiphong"],
    ["印度尼西亚", "Jakarta"],
    ["印度尼西亚", "Surabaya"],
    ["菲律宾", "Manila"],
    ["菲律宾", "Cebu"],
  ] as const) {
    rows.push({ country, port, usdPerCbm: sea, note: seaNote });
  }

  const jpKansaiNote = n("日本关西 SCFI 20'≈316USD");
  const jpKansai = perTeu(316);
  for (const port of ["Osaka", "Kobe", "Nagoya"]) {
    rows.push({ country: "日本", port, usdPerCbm: jpKansai, note: jpKansaiNote });
  }
  const jpKantoNote = n("日本关东 SCFI 20'≈318USD");
  const jpKanto = perTeu(318);
  for (const port of ["Tokyo", "Yokohama"]) {
    rows.push({ country: "日本", port, usdPerCbm: jpKanto, note: jpKantoNote });
  }

  const krNote = n("韩国 SCFI 20'≈162USD");
  const kr = perTeu(162);
  for (const port of ["Busan", "Incheon", "Gwangyang", "Ulsan"]) {
    rows.push({ country: "韩国", port, usdPerCbm: kr, note: krNote });
  }

  const afNote = (r: number, t: string) => n(`非洲代表值 20'≈${r}USD (${t})`);
  const af: Array<[string, string, number, string]> = [
    ["南非", "Durban", 2200, "南非线"],
    ["南非", "Cape Town", 2200, "南非线"],
    ["肯尼亚", "Mombasa", 2400, "东非"],
    ["坦桑尼亚", "Dar es Salaam", 2500, "东非"],
    ["尼日利亚", "Lagos", 4200, "西非"],
    ["加纳", "Tema", 3800, "西非"],
    ["多哥", "Lome", 3600, "西非"],
    ["科特迪瓦", "Abidjan", 3700, "西非"],
    ["摩洛哥", "Casablanca", 2400, "北非"],
    ["阿尔及利亚", "Algiers", 2500, "北非"],
    ["苏丹", "Port Sudan", 4000, "东北非"],
  ];
  for (const [country, port, usd, tag] of af) {
    rows.push({ country, port, usdPerCbm: perTeu(usd), note: afNote(usd, tag) });
  }

  const veNote = n("中南美其他 40'≈5338USD(取5119~5558中值)");
  rows.push({ country: "委内瑞拉", port: "Puerto Cabello", usdPerCbm: perFeu(5338), note: veNote });

  return rows;
}

export async function seedShippingPorts(prisma: PrismaClient) {
  const portRows = buildPortRows();
  const countrySort = new Map<string, number>();
  let ord = 0;
  for (const r of portRows) {
    if (!countrySort.has(r.country)) countrySort.set(r.country, ord++);
  }

  for (const [name, sortOrder] of countrySort) {
    await prisma.country.upsert({
      where: { name },
      update: { sortOrder, enabled: true },
      create: { name, sortOrder, enabled: true },
    });
  }

  const fixedFees = (note: string) => [{ name: note, amountUsd: 0 }];

  for (const r of portRows) {
    const country = await prisma.country.findUnique({ where: { name: r.country } });
    if (!country) continue;

    const port = await prisma.port.upsert({
      where: { countryId_name: { countryId: country.id, name: r.port } },
      update: { enabled: true },
      create: { countryId: country.id, name: r.port, enabled: true },
    });

    await prisma.pricingRule.upsert({
      where: { portId: port.id },
      update: {
        usdPerCbm: r.usdPerCbm,
        minBillableCbm: null,
        fixedFees: fixedFees(r.note),
      },
      create: {
        portId: port.id,
        usdPerCbm: r.usdPerCbm,
        minBillableCbm: null,
        fixedFees: fixedFees(r.note),
      },
    });
  }

  await prisma.siteSetting.upsert({
    where: { key: "shipping.meta" },
    update: {
      value: {
        title: "上海港出口运价种子说明",
        validity: "2026-04-01 ~ 2026-04-15（与表一致，后续请人工更新）",
        source: "上海航运交易所、船公司、线上运价平台（用户整理表）",
        teuDivisor: TEU_CBM,
        feuDivisor: FEU_CBM,
        disclaimer:
          "整箱运价为市场参考；本系统按 20'÷28CBM、40'÷67CBM 折算为 USD/CBM 仅作估算，以实际订舱报价为准。",
        injectedPortCount: portRows.length,
      },
    },
    create: {
      key: "shipping.meta",
      value: {
        title: "上海港出口运价种子说明",
        validity: "2026-04-01 ~ 2026-04-15（与表一致，后续请人工更新）",
        source: "上海航运交易所、船公司、线上运价平台（用户整理表）",
        teuDivisor: TEU_CBM,
        feuDivisor: FEU_CBM,
        disclaimer:
          "整箱运价为市场参考；本系统按 20'÷28CBM、40'÷67CBM 折算为 USD/CBM 仅作估算，以实际订舱报价为准。",
        injectedPortCount: portRows.length,
      },
    },
  });

  console.log(`[seed] shipping routes: ${portRows.length} ports + pricing rules + shipping.meta`);
}
