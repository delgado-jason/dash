import { Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "@/layouts/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import LoadsPage from "@/pages/LoadsPage";
import FuelEntriesPage from "@/pages/FuelEntriesPage";
import TrucksPage from "@/pages/TrucksPage";
import DriversPage from "@/pages/DriversPage";
import { LoadDetailPage } from "@/pages/LoadDetailPage";

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/loads" element={<LoadsPage />} />
          <Route path="/loads/:load_id" element={<LoadDetailPage />} />
          <Route path="/fuel-entries" element={<FuelEntriesPage />} />
          <Route path="/trucks" element={<TrucksPage />} />
          <Route path="/drivers" element={<DriversPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default App;
