import { useState } from "react";
import { useTrips } from "@/hooks/useTrips";
import TripForm from "@/components/TripForm";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";
import type { Trip } from "@/types/trip";

// "Irving, TX" from a city/state pair; falls back to whichever is present.
const place = (city: string | null, state: string | null): string | null => {
  if (city && state) return `${city}, ${state}`;
  return state || city || null;
};

// "Irving, TX → Laredo, TX" for the trips table, or a dash when neither end is set.
const tripRoute = (trip: Trip): string => {
  const from = place(trip.start_city, trip.start_state);
  const to = place(trip.end_city, trip.end_state);
  if (!from && !to) return "—";
  return `${from ?? "?"} → ${to ?? "?"}`;
};

// Components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TripsPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const { trips, isLoading, error } = useTrips(refreshKey);

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light font-body min-h-screen">
        <Skeleton className="h-8 w-24 mb-6" />
        <RowsSkeleton rows={8} />
      </div>
    );

  if (error)
    return (
      <div className="p-6 bg-iron text-light font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-condensed text-light">Trips</h1>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>Log Trip</Button>
        )}
      </div>

      {showForm && (
        <TripForm
          onSuccess={() => setRefreshKey((k) => k + 1)}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="bg-iron mt-4 p-6">
        {trips.length === 0 ? (
          <EmptyState
            title="No trips logged yet"
            hint="Log a trip to track odometer miles, routes, and deadhead."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trip #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>OD Start</TableHead>
                <TableHead>OD End</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((trip) => (
                <TableRow key={trip.trip_id}>
                  <TableCell className="text-foreground">
                    {trip.trip_number}
                  </TableCell>
                  <TableCell>{formatDate(trip.trip_date)}</TableCell>
                  <TableCell>{trip.trip_purpose}</TableCell>
                  <TableCell>{tripRoute(trip)}</TableCell>
                  <TableCell>{trip.odometer_start}</TableCell>
                  <TableCell>{trip.odometer_end}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default TripsPage;
