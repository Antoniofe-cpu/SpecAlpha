import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@/index.css";
import App from "@/App";
import LandingPage from "@/pages/LandingPage";
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
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<App />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LangProvider>
    </AuthProvider>
  </React.StrictMode>,
);
