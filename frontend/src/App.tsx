import { Routes, Route, Navigate } from "react-router";

// Layout
import AppLayout from "@/layouts/AppLayout";

// Pages
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import TripsPage from "@/pages/TripsPage";
import TripDetailPage from "@/pages/TripDetailPage";
import LoadsPage from "@/pages/LoadsPage";
import FuelEntriesPage from "@/pages/FuelEntriesPage";
import TrucksPage from "@/pages/TrucksPage";
import DriversPage from "@/pages/DriversPage";

const App = () => {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* App Layout Wrapper */}
      <Route element={<AppLayout />}>
        {/* Default route */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/loads" element={<LoadsPage />} />
        <Route path="/fuel-entries" element={<FuelEntriesPage />} />
        <Route path="/trucks" element={<TrucksPage />} />
        <Route path="/drivers" element={<DriversPage />} />
      </Route>
    </Routes>
  );
};

export default App;
