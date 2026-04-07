import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { getLang, setLang, SUPPORTED_LANGS, type Lang } from "../lib/api";

import zhCommon from "../locales/zh/common.json";
import enCommon from "../locales/en/common.json";
import frCommon from "../locales/fr/common.json";
import esCommon from "../locales/es/common.json";
import ptCommon from "../locales/pt/common.json";
import ruCommon from "../locales/ru/common.json";
import koCommon from "../locales/ko/common.json";
import msCommon from "../locales/ms/common.json";
import thCommon from "../locales/th/common.json";
import viCommon from "../locales/vi/common.json";
import arCommon from "../locales/ar/common.json";
import swCommon from "../locales/sw/common.json";

const resources = {
  zh: { common: zhCommon },
  en: { common: enCommon },
  fr: { common: frCommon },
  es: { common: esCommon },
  pt: { common: ptCommon },
  ru: { common: ruCommon },
  ko: { common: koCommon },
  ms: { common: msCommon },
  th: { common: thCommon },
  vi: { common: viCommon },
  ar: { common: arCommon },
  sw: { common: swCommon },
} as const;

export function isSupportedLang(raw: string | null | undefined): raw is Lang {
  return !!raw && (SUPPORTED_LANGS as readonly string[]).includes(raw);
}

export async function initI18n() {
  if (i18n.isInitialized) return i18n;

  const urlLang = new URL(window.location.href).searchParams.get("lang");
  const stored = isSupportedLang(urlLang) ? urlLang : getLang();

  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: resources as any,
      ns: ["common"],
      defaultNS: "common",
      lng: stored,
      fallbackLng: "zh",
      supportedLngs: [...SUPPORTED_LANGS],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: "lang",
        caches: [],
      },
    });

  // Ensure our app state is aligned with i18next
  if (isSupportedLang(i18n.language) && i18n.language !== stored) {
    setLang(i18n.language);
  } else {
    setLang(stored);
  }

  return i18n;
}

