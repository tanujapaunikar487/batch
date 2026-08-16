import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { native } from "@/lib/native";

if (import.meta.env.DEV) {
  window.addEventListener("error", (e) => void native.devLog(`error: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => void native.devLog(`unhandled: ${String(e.reason)}`));
  window.addEventListener("focus", () => void native.devLog("window focus"));
  window.addEventListener("blur", () => void native.devLog("window blur"));
  void native.devLog(`webview booted (hasFocus=${document.hasFocus()})`);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
