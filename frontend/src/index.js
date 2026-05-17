import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/index.css";
import App from "@/App";
import AdminPanel from "@/admin/AdminPanel";
import { LangProvider } from "@/i18n";
import { AuthProvider } from "@/auth/AuthContext";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <LangProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="*" element={<App />} />
          </Routes>
        </BrowserRouter>
      </LangProvider>
    </AuthProvider>
  </React.StrictMode>,
);
