import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "@/layouts/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import TripsPage from "@/pages/TripsPage";
import LoadsPage from "@/pages/LoadsPage";
import FuelEntriesPage from "@/pages/FuelEntriesPage";
import TrucksPage from "@/pages/TrucksPage";
import DriversPage from "@/pages/DriversPage";
import TripDetailPage from "./pages/TripDetailPage";

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/:trip_id" element={<TripDetailPage />} />
          <Route path="/loads" element={<LoadsPage />} />
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
