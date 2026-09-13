import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "@/layouts/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import LoadsPage from "@/pages/LoadsPage";
import TripsPage from "@/pages/TripsPage";
import ScoreLoadPage from "@/pages/ScoreLoadPage";
import ForemanPage from "@/pages/ForemanPage";
import GaragePage from "@/pages/GaragePage";
import ExpensesPage from "@/pages/ExpensesPage";
import MarketPage from "@/pages/MarketPage";
import PerDiemPage from "@/pages/PerDiemPage";
import StatusPage from "@/pages/StatusPage";
import CashFlowPage from "@/pages/CashFlowPage";
import RelationshipsLayout from "@/pages/relationships/RelationshipsLayout";
import TodayView from "@/pages/relationships/TodayView";
import CallsView from "@/pages/relationships/CallsView";
import TiersView from "@/pages/relationships/TiersView";
import ReviewView from "@/pages/relationships/ReviewView";
import MaintenancePage from "@/pages/MaintenancePage";
import AgentsPage from "@/pages/AgentsPage";
import AgentDetailPage from "./pages/AgentDetailPage";
import VendorsPage from "@/pages/VendorsPage";
import VendorDetailPage from "@/pages/VendorDetailPage";
import FuelEntriesPage from "@/pages/FuelEntriesPage";
import TrucksPage from "@/pages/TrucksPage";
import TruckDetailPage from "@/pages/TruckDetailPage";
import DriversPage from "@/pages/DriversPage";
import DriverDetailPage from "@/pages/DriverDetailPage";
import TrailersPage from "@/pages/TrailersPage";
import TrailerDetailPage from "@/pages/TrailerDetailPage";
import FacilitiesPage from "@/pages/FacilitiesPage";
import FacilityDetailPage from "@/pages/FacilityDetailPage";
import { LoadDetailPage } from "@/pages/LoadDetailPage";
import { SwatchesPage } from "@/pages/SwatchesPage";
import SignupPage from "@/pages/SignupPage";
import GuidePage from "@/pages/GuidePage";
import DispatcherPage from "@/pages/DispatcherPage";
import DispatchForgePage from "@/pages/DispatchForgePage";
import DispatcherRecapPage from "@/pages/DispatcherRecapPage";
import CompliancePage from "@/pages/CompliancePage";
import RecapPage from "@/pages/RecapPage";
import TrophyHallPage from "@/pages/TrophyHallPage";
import TrophyStudioPage from "@/pages/TrophyStudioPage";
import SettingsPage from "@/pages/SettingsPage";

// Code-split Lanes — it bundles the US map topology (~600KB), so it should only
// load when the page is actually visited, not on every app start.
const LanesPage = lazy(() => import("@/pages/LanesPage"));

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dev/swatches" element={<SwatchesPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/loads" element={<LoadsPage />} />
          <Route path="/loads/:load_id" element={<LoadDetailPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/score" element={<ScoreLoadPage />} />
          <Route path="/foreman" element={<ForemanPage />} />
          <Route
            path="/lanes"
            element={
              <Suspense
                fallback={
                  <div className="p-6 bg-iron text-light font-body">
                    <p className="text-muted-text">Loading lanes...</p>
                  </div>
                }
              >
                <LanesPage />
              </Suspense>
            }
          />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:agent_id" element={<AgentDetailPage />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/vendors/:vendor_id" element={<VendorDetailPage />} />
          <Route path="/trucks" element={<TrucksPage />} />
          <Route path="/trucks/:id" element={<TruckDetailPage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/drivers/:id" element={<DriverDetailPage />} />
          <Route path="/trailers" element={<TrailersPage />} />
          <Route path="/trailers/:id" element={<TrailerDetailPage />} />
          <Route path="/facilities" element={<FacilitiesPage />} />
          <Route path="/facilities/:id" element={<FacilityDetailPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/dispatcher/:id" element={<DispatcherPage />} />
          <Route path="/forge" element={<DispatchForgePage />} />
          <Route path="/my-recap" element={<DispatcherRecapPage />} />
          {/* Brandie's workflow — Today · Call list · Tiers · Review under one
              shell; the owner-only tier controls live inside the agent sheet. */}
          <Route path="/relationships" element={<RelationshipsLayout />}>
            <Route index element={<Navigate to="today" replace />} />
            <Route path="today" element={<TodayView />} />
            {/* /calls/:agentId is the call screen — a route, so a refresh
                mid-call lands back on the call; one element so the list's
                filters survive the push. */}
            <Route path="calls/:agentId?" element={<CallsView />} />
            <Route path="tiers" element={<TiersView />} />
            <Route path="review" element={<ReviewView />} />
          </Route>

          {/* Owner-only — a dispatcher is redirected to /dashboard (see roles.ts) */}
          <Route element={<AdminRoute />}>
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/per-diem" element={<PerDiemPage />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/cashflow" element={<CashFlowPage />} />
            <Route path="/recap" element={<RecapPage />} />
            <Route path="/garage" element={<GaragePage />} />
            <Route path="/trophy-room" element={<TrophyHallPage />} />
            <Route path="/trophy-studio" element={<TrophyStudioPage />} />
            <Route path="/fuel-entries" element={<FuelEntriesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default App;
