import { useNavigate } from "react-router";

import useTrips from "@/hooks/useTrips";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const TripsPage = () => {
  const { trips, isLoading, error } = useTrips();
  const navigate = useNavigate();

  const handleEditClick = (tripId: string) => {
    if (tripId) {
      navigate(`/trips/${tripId}`);
    }
  };

  if (isLoading) {
    return (
      <div>
        <p>Loading trips</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <p>{error}</p>
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div>
        <p>No trips yet</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50">
      <div className="bg-slate-200 pb-6 font-semibold">
        <h1 className="text-2xl">Trips</h1>
      </div>
      <Table className="border-2 border-slate-300">
        <TableHeader className="rounded-t-md">
          <TableRow className="text-xs font-extrabold">
            <TableHead className="w-[100px]">Trip #</TableHead>
            <TableHead>Trip Date</TableHead>
            <TableHead>Driver Name</TableHead>
            <TableHead>Unit #</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-xs">
          {trips.map((trip) => (
            <TableRow key={trip.trip_id}>
              <TableCell className="font-medium">{trip.trip_number}</TableCell>
              <TableCell>{trip.trip_date}</TableCell>
              <TableCell>{trip.driver_name}</TableCell>
              <TableCell>{trip.unit_number}</TableCell>
              <TableCell>{trip.trip_status}</TableCell>
              <TableCell className="flex p-2">
                <div className="border-r-2 pr-2">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => handleEditClick(trip.trip_id)}
                  >
                    Edit
                  </Button>
                </div>
                <div className="pl-2">
                  <Button size="xs" variant="destructive">
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {/* <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total</TableCell>
            <TableCell className="text-right">$2,500.00</TableCell>
          </TableRow>
        </TableFooter> */}
      </Table>
    </div>
  );
};

export default TripsPage;
