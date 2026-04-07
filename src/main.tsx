import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from './App.tsx';
import './index.css';
import AdminApp from './admin/AdminApp.tsx';
import { initI18n } from "./i18n";
import { I18nextProvider } from "react-i18next";

const isAdmin = window.location.pathname.startsWith("/admin");

const rootEl = document.getElementById("root")!;
const root = createRoot(rootEl);

async function boot() {
  let i18n: any = null;
  if (!isAdmin) {
    i18n = await initI18n();
  }
  root.render(
    <StrictMode>
      {isAdmin ? (
        <AdminApp />
      ) : (
        <I18nextProvider i18n={i18n}>
          <App />
        </I18nextProvider>
      )}
    </StrictMode>,
  );
}

boot();
