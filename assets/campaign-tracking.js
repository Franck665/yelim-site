import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const dbPromise = fetch("/__/firebase/init.json")
  .then((response) => response.json())
  .then((firebaseConfig) => getFirestore(initializeApp(firebaseConfig)));

export const stores = {
  ios: "https://apps.apple.com/app/y%C3%A9lim/id6758163762",
  android: "https://play.google.com/store/apps/details?id=com.s1.yelim",
  androidMarket: "market://details?id=com.s1.yelim"
};

export function params() {
  return new URLSearchParams(window.location.search);
}

export function campaignContext() {
  const query = params();
  const isBagsPath = window.location.pathname.includes("/catalogue/sacs");
  return {
    campaignId: clean(query.get("campaign") || "contacts_admin_ios_v1", 80),
    contactId: clean(query.get("c") || query.get("contactId") || "unknown", 120),
    segment: clean(query.get("s") || query.get("segment") || "UNKNOWN", 40),
    location: clean(query.get("l") || query.get("location") || "", 80),
    code: clean(query.get("code") || "", 40),
    source: clean(query.get("src") || "whatsapp", 80),
    focus: clean(query.get("focus") || (isBagsPath ? "bags" : ""), 40),
    hashtag: clean(query.get("hashtag") || (isBagsPath ? "sacs à main femme" : ""), 80)
  };
}

export function platform() {
  const ua = navigator.userAgent || navigator.vendor || "";
  const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isiOS) return "ios";
  if (/android/i.test(ua)) return "android";
  return "web";
}

export async function trackCampaignClick(target) {
  const context = campaignContext();
  try {
    const db = await dbPromise;
    await addDoc(collection(db, "campaign_clicks"), {
      ...context,
      target: clean(target, 40),
      platform: platform(),
      path: clean(window.location.pathname, 200),
      userAgent: clean(navigator.userAgent || "", 300),
      referrer: clean(document.referrer || "", 300),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("campaign tracking failed", error);
  }
}

export async function openStore(target = "auto") {
  await trackCampaignClick(target);
  const detected = platform();
  const openedNative = await openNativeApp(nativeCampaignUrl());
  if (openedNative) return;

  if (target === "ios" || detected === "ios") {
    window.location.href = stores.ios;
    return;
  }
  if (target === "android" || detected === "android") {
    window.location.href = stores.androidMarket;
    setTimeout(() => {
      window.location.href = stores.android;
    }, 600);
    return;
  }
  document.body.classList.add("show-store-buttons");
}

export function nativeCampaignUrl() {
  const context = campaignContext();
  const query = new URLSearchParams();
  query.set("campaign", context.campaignId);
  query.set("c", context.contactId);
  query.set("contactId", context.contactId);
  query.set("s", context.segment);
  query.set("segment", context.segment);
  query.set("l", context.location);
  query.set("location", context.location);
  query.set("code", context.code);
  query.set("src", context.source);
  if (context.focus) query.set("focus", context.focus);
  if (context.hashtag) query.set("hashtag", context.hashtag);

  if (context.focus === "bags" || context.hashtag) {
    return `yelim://catalogue?${query.toString()}`;
  }

  return `yelim://home?${query.toString()}`;
}

async function openNativeApp(nativeUrl) {
  const detected = platform();
  if (detected !== "ios" && detected !== "android") return false;

  await trackCampaignClick("native_app_open_attempt");
  let didHide = false;
  const markHidden = () => {
    didHide = true;
  };
  document.addEventListener("visibilitychange", markHidden, { once: true });
  window.location.href = nativeUrl;

  await new Promise((resolve) => setTimeout(resolve, 900));
  document.removeEventListener("visibilitychange", markHidden);
  return didHide || document.hidden;
}

export function bindStoreButtons() {
  document.querySelectorAll("[data-store]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      await openStore(button.dataset.store);
    });
  });
}

export function populateCampaignText() {
  const context = campaignContext();
  document.querySelectorAll("[data-campaign-location]").forEach((node) => {
    node.textContent = context.location || node.textContent;
  });
  document.querySelectorAll("[data-campaign-code]").forEach((node) => {
    node.textContent = context.code || node.textContent;
  });
  document.querySelectorAll("[data-code-wrap]").forEach((node) => {
    node.hidden = !context.code;
  });
}

function clean(value, maxLength) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
}
