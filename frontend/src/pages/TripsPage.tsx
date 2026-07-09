import { useState } from "react";
import { useTrips } from "@/hooks/useTrips";
import TripForm from "@/components/TripForm";
import { Button } from "@/components/ui/button";

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
      <div className="p-6 bg-iron text-light font-body">
        <p className="text-muted-text">Loading trips...</p>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trip #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Purpose</TableHead>
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
                <TableCell>{trip.trip_date}</TableCell>
                <TableCell>{trip.trip_purpose}</TableCell>
                <TableCell>{trip.odometer_start}</TableCell>
                <TableCell>{trip.odometer_end}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default TripsPage;
