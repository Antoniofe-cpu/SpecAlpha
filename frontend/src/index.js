import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import "@/index.css";
import App from "@/App";
import LandingPage from "@/pages/LandingPage";
import AdminPanel from "@/admin/AdminPanel";
import AccountPage from "@/pages/AccountPage";
import { LangProvider } from "@/i18n";
import { AuthProvider } from "@/auth/AuthContext";
import { trackPageView } from "@/analytics";

/** Fires a GA4 page_view on every SPA route change. */
function RouteAnalytics() {
    const location = useLocation();
    useEffect(() => {
        trackPageView(location.pathname + location.search);
    }, [location.pathname, location.search]);
    return null;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <LangProvider>
        <BrowserRouter>
          <RouteAnalytics />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<App />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LangProvider>
    </AuthProvider>
  </React.StrictMode>,
);
