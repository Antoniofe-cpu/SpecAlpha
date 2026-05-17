import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { LangProvider } from "@/i18n";
import { AuthProvider } from "@/auth/AuthContext";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <LangProvider>
        <App />
      </LangProvider>
    </AuthProvider>
  </React.StrictMode>,
);
