import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from './App.tsx';
import './index.css';
import AdminApp from './admin/AdminApp.tsx';
import { initI18n } from "./i18n";
import { I18nextProvider } from "react-i18next";
import { consumeAdminEntryUnlockFromUrl } from "./lib/admin-entry";

/** 访问 /admin 始终进入后台壳子（仍需账号密码）；密钥只控制导航栏是否显示入口，见 shouldExposeAdminUi */
const isAdminPath = window.location.pathname.startsWith("/admin");
if (isAdminPath) consumeAdminEntryUnlockFromUrl();
const isAdmin = isAdminPath;

const rootEl = document.getElementById("root")!;
const root = createRoot(rootEl);

async function boot() {
  const i18n = await initI18n();
  root.render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        {isAdmin ? <AdminApp /> : <App />}
      </I18nextProvider>
    </StrictMode>,
  );
}

boot();
