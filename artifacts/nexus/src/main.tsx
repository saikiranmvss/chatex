import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
if (base) setBaseUrl(base);
setAuthTokenGetter(() => localStorage.getItem("nexus_token"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
