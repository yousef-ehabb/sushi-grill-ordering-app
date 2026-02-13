
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { InsforgeProvider } from "@insforge/react";
import { insforge } from "./lib/insforge";
import App from "./app/App.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <InsforgeProvider client={insforge}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </InsforgeProvider>
);