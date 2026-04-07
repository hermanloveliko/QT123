import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedShippingPorts } from "./shipping-routes.seed";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function ensureCategory(name: string, sortOrder: number) {
  return prisma.category.upsert({
    where: { name },
    update: { sortOrder },
    create: { name, sortOrder, enabled: true },
  });
}

async function ensureCategoryI18n(categoryId: string, lang: string, name: string) {
  await prisma.categoryI18n.upsert({
    where: { categoryId_lang: { categoryId, lang: lang as any } },
    update: { name },
    create: { categoryId, lang: lang as any, name },
  });
}

async function ensureProductI18n(
  productId: string,
  lang: string,
  data: { name: string; description?: string; specs?: string[] },
) {
  await prisma.productI18n.upsert({
    where: { productId_lang: { productId, lang: lang as any } },
    update: {
      name: data.name,
      description: data.description ?? "",
      specs: data.specs ?? [],
    },
    create: {
      productId,
      lang: lang as any,
      name: data.name,
      description: data.description ?? "",
      specs: data.specs ?? [],
    },
  });
}

async function main() {
  const username = "QT123";
  const password = "QT123";

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.upsert({
    where: { username },
    update: {},
    create: { username, passwordHash },
  });

  await prisma.siteSetting.upsert({
    where: { key: "contact" },
    update: {},
    create: {
      key: "contact",
      value: {
        phone: "+86 21 5888 8888",
        email: "info@qingtai-materials.com",
        whatsapp: "+86 138 0000 0000",
        address: "上海市浦东新区张江高科技园区青泰大厦 888 号",
      },
    },
  });

  await prisma.siteSetting.upsert({
    where: { key: "home.consultation" },
    update: {},
    create: {
      key: "home.consultation",
      value: {
        title: "需要专业材料咨询？",
        description: "我们的工程师团队随时为您提供技术支持、材料选型及成本估算服务。",
        backgroundOpacity: 0.45,
        hotlineLabel: "WhatsApp",
        hotlineValue: "+86 138 0000 0000",
      },
    },
  });

  const cSteel = await ensureCategory("轻钢龙骨", 1);
  const cGypsum = await ensureCategory("石膏板", 2);
  const cAl = await ensureCategory("铝制饰面", 3);
  const cSound = await ensureCategory("隔音材料", 4);
  const cFast = await ensureCategory("紧固件", 5);
  const cTool = await ensureCategory("辅助工具", 6);

  // Minimal English i18n for demo categories (so switching lang has visible effect)
  await ensureCategoryI18n(cSteel.id, "en", "Steel framing");
  await ensureCategoryI18n(cGypsum.id, "en", "Gypsum boards");
  await ensureCategoryI18n(cAl.id, "en", "Aluminum finishes");
  await ensureCategoryI18n(cSound.id, "en", "Acoustic insulation");
  await ensureCategoryI18n(cFast.id, "en", "Fasteners");
  await ensureCategoryI18n(cTool.id, "en", "Tools");

  const demoProducts: Array<{
    name: string;
    categoryId: string;
    priceUsd: number;
    specs: string[];
    description: string;
    imageCoverUrl: string;
    cbmPerUnit: number;
  }> = [
    {
      name: "TITAN-X 结构工字钢",
      categoryId: cSteel.id,
      priceUsd: 399.99,
      specs: ["Q355B 级钢材", "热轧工艺", "高强度抗震"],
      description:
        "采用高强度 Q355B 级钢材，经过精密热轧工艺制造，具有卓越的承载能力和抗震性能，适用于大型工业厂房及高层建筑结构。",
      imageCoverUrl: "https://picsum.photos/seed/steel1/800/600",
      cbmPerUnit: 0.052,
    },
    {
      name: "防火石膏板 (12mm)",
      categoryId: cGypsum.id,
      priceUsd: 12.5,
      specs: ["A 级防火", "隔音降噪", "环保材料"],
      description: "高密度防火石膏板，内含玻璃纤维增强，提供卓越的防火保护和隔音效果。",
      imageCoverUrl: "https://picsum.photos/seed/gypsum/800/600",
      cbmPerUnit: 0.018,
    },
    {
      name: "铝制方通吊顶系统",
      categoryId: cAl.id,
      priceUsd: 89.0,
      specs: ["耐腐蚀", "轻质高强", "多种涂层"],
      description: "优质铝合金材质，表面采用氟碳喷涂，色彩持久，安装便捷，适用于商业空间吊顶。",
      imageCoverUrl: "https://picsum.photos/seed/aluminum/800/600",
      cbmPerUnit: 0.014,
    },
    {
      name: "高强隔音棉 (50mm)",
      categoryId: cSound.id,
      priceUsd: 24.0,
      specs: ["超细纤维", "阻燃性能", "吸音率高"],
      description: "采用超细无机纤维制造，具有极高的吸音系数和优异的阻燃性能，是室内隔墙和吊顶的理想填充材料。",
      imageCoverUrl: "https://picsum.photos/seed/sound/800/600",
      cbmPerUnit: 0.008,
    },
    {
      name: "不锈钢自攻螺丝 (M4)",
      categoryId: cFast.id,
      priceUsd: 0.08,
      specs: ["304 不锈钢", "精密螺纹", "耐腐蚀"],
      description: "高品质 304 不锈钢材质，精密冷镦工艺，硬度高，防锈能力强，适用于各种轻钢结构的连接。",
      imageCoverUrl: "https://picsum.photos/seed/screw/800/600",
      cbmPerUnit: 0.000002,
    },
    {
      name: "精密水平激光仪",
      categoryId: cTool.id,
      priceUsd: 220.0,
      specs: ["高精度", "自动找平", "强力绿光"],
      description: "专业级高精度激光水平仪，采用强力绿光光源，在明亮环境下依然清晰可见，是室内装修和结构安装的必备工具。",
      imageCoverUrl: "https://picsum.photos/seed/laser/800/600",
      cbmPerUnit: 0.003,
    },
  ];

  for (const p of demoProducts) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    const row =
      existing ||
      (await prisma.product.create({
        data: {
          name: p.name,
          categoryId: p.categoryId,
          priceUsd: p.priceUsd,
          enabled: true,
          imageCoverUrl: p.imageCoverUrl,
          specs: p.specs,
          description: p.description,
          cbmPerUnit: p.cbmPerUnit,
        },
      }));

    // Minimal English i18n for demo products
    if (p.name.includes("TITAN-X")) {
      await ensureProductI18n(row.id, "en", {
        name: "TITAN-X Structural I-Beam Steel",
        description:
          "High-strength Q355B steel manufactured with precision hot rolling. Excellent load capacity and seismic performance for industrial plants and high-rise structures.",
        specs: ["Q355B grade steel", "Hot-rolled", "High seismic strength"],
      });
    } else if (p.name.includes("防火石膏板")) {
      await ensureProductI18n(row.id, "en", {
        name: "Fire-rated gypsum board (12mm)",
        description: "High-density fire-rated gypsum board reinforced with glass fiber for excellent fire protection and sound insulation.",
        specs: ["A-class fire rating", "Sound insulation", "Eco-friendly material"],
      });
    } else if (p.name.includes("铝制方通")) {
      await ensureProductI18n(row.id, "en", {
        name: "Aluminum baffle ceiling system",
        description: "Premium aluminum alloy with PVDF coating. Durable color and easy installation for commercial ceiling applications.",
        specs: ["Corrosion-resistant", "Lightweight & strong", "Multiple coatings"],
      });
    } else if (p.name.includes("隔音棉")) {
      await ensureProductI18n(row.id, "en", {
        name: "High-strength acoustic insulation (50mm)",
        description: "Made from ultra-fine inorganic fibers with high sound absorption and excellent flame-retardant performance for partitions and ceilings.",
        specs: ["Ultra-fine fibers", "Flame-retardant", "High absorption"],
      });
    } else if (p.name.includes("自攻螺丝")) {
      await ensureProductI18n(row.id, "en", {
        name: "Stainless self-tapping screw (M4)",
        description: "304 stainless steel with precision cold heading. High hardness and corrosion resistance for steel framing connections.",
        specs: ["304 stainless steel", "Precision thread", "Corrosion-resistant"],
      });
    } else if (p.name.includes("激光仪")) {
      await ensureProductI18n(row.id, "en", {
        name: "Precision laser level",
        description: "Professional high-precision laser level with bright green beam. Clear visibility in bright environments for interior and structural installation.",
        specs: ["High precision", "Self-leveling", "Bright green beam"],
      });
    }
  }

  await prisma.siteSetting.upsert({
    where: { key: "home.systems" },
    update: {},
    create: {
      key: "home.systems",
      value: [
        {
          id: "s1",
          title: "隔墙系统",
          image: "https://picsum.photos/seed/sys1/800/600",
          description: "青泰精密隔墙系统结合了轻钢龙骨的结构强度与石膏板的多功能性。",
          features: ["高强度承载", "快速模块化安装", "卓越的隔音性能", "A 级防火认证"],
        },
        {
          id: "s2",
          title: "吊顶系统",
          image: "https://picsum.photos/seed/sys2/800/600",
          description: "涵盖铝制方通、矿棉板及石膏吊顶，为商业与工业空间提供美观且实用的顶部解决方案。",
          features: ["轻质高强", "耐腐蚀表面处理", "便捷的检修入口", "丰富的色彩选择"],
        },
        {
          id: "s3",
          title: "特殊板材系统",
          image: "https://picsum.photos/seed/sys3/800/600",
          description: "针对极端环境研发的防潮、防霉、防辐射及超高硬度特殊板材。",
          features: ["极端环境耐受", "医疗级防辐射", "超长使用寿命", "环保无甲醛"],
        },
      ],
    },
  });

  await prisma.siteSetting.upsert({
    where: { key: "home.projects" },
    update: {},
    create: {
      key: "home.projects",
      value: [
        {
          id: "p1",
          title: "上海中心大厦内部隔墙工程",
          location: "上海, 中国",
          image: "https://picsum.photos/seed/proj1/800/600",
          description:
            "该项目采用了我司研发的高强度轻钢龙骨系统及 A 级防火石膏板，总施工面积超过 50,000 平方米。在超高层建筑的抗震与防火性能上达到了国际领先水平。",
        },
        {
          id: "p2",
          title: "北京大兴国际机场航站楼吊顶",
          location: "北京, 中国",
          image: "https://picsum.photos/seed/proj2/800/600",
          description:
            "为机场航站楼提供了定制化的铝制方通吊顶系统，采用特殊的氟碳喷涂工艺，确保在大流量公共空间内的耐久性与美观度。",
        },
        {
          id: "p3",
          title: "新加坡滨海湾金沙酒店扩建",
          location: "滨海湾, 新加坡",
          image: "https://picsum.photos/seed/proj3/800/600",
          description: "提供了全套的隔音与饰面解决方案，满足了豪华酒店对私密性与装饰美学的极高要求。",
        },
      ],
    },
  });

  await prisma.siteSetting.upsert({
    where: { key: "home.logistics" },
    update: {},
    create: {
      key: "home.logistics",
      value: {
        title: "全球物流与追踪",
        description:
          "我们拥有完善的全球供应链网络，确保材料准时、安全地送达您的施工现场。通过实时追踪系统，您可以随时掌握订单动态。",
        cards: [
          {
            title: "快速响应交付",
            description: "核心城市 24 小时内送达，全球范围内 7-15 天交付。",
          },
          {
            title: "全程质量监控",
            description: "从出库到签收，每一步都经过严格的质量检查与数字化记录。",
          },
        ],
        slideImageUrls: [] as string[],
        slideSeeds: ["logistics1", "logistics2", "logistics3"],
        trackTitle: "订单实时追踪",
        trackOrderId: "QT-2026-8892",
        trackStatus: "运输中",
        trackLocation: "上海港 - 国际货运中心",
        trackEta: "2026-03-28",
      },
    },
  });

  await prisma.siteSetting.upsert({
    where: { key: "footer" },
    update: {},
    create: {
      key: "footer",
      value: {
        tagline: "致力于为全球建筑行业提供高品质、精密、环保的建筑装饰隔墙吊顶材料。",
        address: "上海市浦东新区张江高科技园区青泰大厦 888 号",
        phone: "+86 21 5888 8888",
        email: "info@qingtai-materials.com",
        copyright: "© 2026 青泰建材 (Qingtai Materials) 版权所有。",
        quickLinks: [
          { label: "阿里国际站", href: "https://qingtai.en.alibaba.com" },
          { label: "官方网站", href: "#" },
          { label: "中国制造", href: "https://qingtai.made-in-china.com" },
        ],
        legalLinks: [
          { label: "隐私政策", href: "#" },
          { label: "服务条款", href: "#" },
          { label: "Cookie 设置", href: "#" },
        ],
        newsletterTitle: "订阅通讯",
        newsletterDesc: "留下您的邮箱，获取最新的产品资讯和报价。",
      },
    },
  });

  await prisma.siteSetting.upsert({
    where: { key: "catalog.customSpec" },
    update: {},
    create: {
      key: "catalog.customSpec",
      value: {
        title: "需要定制规格？",
        description: "我们提供非标尺寸定制服务，满足您的特殊工程需求。",
        buttonText: "联系定制",
        note: "点击后打开联系方式弹窗；电话/WhatsApp 可在「站点配置 contact」中修改。",
      },
    },
  });

  await prisma.siteSetting.upsert({
    where: { key: "about.page" },
    update: {},
    create: {
      key: "about.page",
      value: {
        heroTitle: "关于青泰",
        heroVideoUrl: "https://assets.mixkit.co/videos/preview/mixkit-construction-site-with-cranes-and-buildings-4004-large.mp4",
        profileEyebrow: "Company Profile",
        profileHeading: "二十年专注，铸就建筑之美",
        profileParagraphs: [
          "青泰建材成立于2006年，总部位于中国上海。二十年来，我们始终致力于建筑装饰隔墙吊顶材料的研发、生产与销售。",
          "作为行业领先的系统解决方案供应商，我们不仅提供高品质的轻钢龙骨、石膏板和铝制饰面材料，更通过精密的技术支持和完善的全球物流体系，为每一个建筑梦想提供坚实的基石。",
          "我们的产品已广泛应用于全球超过1200个标志性工程，包括超高层建筑、国际机场、五星级酒店及大型工业厂房。",
        ],
      },
    },
  });

  /** 全球目的港 + USD/CBM 费率（由贵司航线表折算，见 prisma/shipping-routes.seed.ts） */
  await seedShippingPorts(prisma);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
