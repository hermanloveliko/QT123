/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** 生产环境后台入口密钥：配置后，需访问 `/?admin_key=...` 解锁后才显示后台入口，并允许 `/admin` */
  readonly VITE_ADMIN_ENTRY_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

