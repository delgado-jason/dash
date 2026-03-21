import useTrips from "@/hooks/useTrips";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TripsPage = () => {
  const { trips, isLoading, error } = useTrips();

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
            <TableHead className="w-[100px]">Trip ID</TableHead>
            <TableHead>Truck ID</TableHead>
            <TableHead>Driver ID</TableHead>
            <TableHead>Trip Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Odometer Start</TableHead>
            <TableHead>Odometer End</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-xs">
          {trips.map((trip) => (
            <TableRow key={trip.trip_id}>
              <TableCell className="font-medium">{trip.trip_id}</TableCell>
              <TableCell>{trip.truck_id}</TableCell>
              <TableCell>{trip.driver_id}</TableCell>
              <TableCell>{trip.trip_date}</TableCell>
              <TableCell>{trip.trip_status}</TableCell>
              <TableCell>{trip.odometer_start}</TableCell>
              <TableCell>{trip.odometer_end}</TableCell>
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
