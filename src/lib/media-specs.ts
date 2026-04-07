/** 站点配置图片建议尺寸（允许 ±tolerance 像素误差） */
export const SITE_IMAGE_SPECS = {
  /** 系统方案 / 工程案例封面（与历史 picsum 800×600 一致） */
  cardCover: { width: 800, height: 600, tolerance: 40, label: "800×600 px" },
  /** 物流区轮播（16:9） */
  logisticsSlide: { width: 1280, height: 720, tolerance: 48, label: "1280×720 px（16:9）" },
} as const;
