import { useLoads } from "@/hooks/useLoads";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const LoadsPage = () => {
  const { loads, isLoading, error } = useLoads();
  console.log(loads);

  if (isLoading) {
    return (
      <div>
        <p>Loading...</p>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div>
        <p>{error}</p>
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Load #</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Broker</TableHead>
          <TableHead>Origin</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead>Pickup Date</TableHead>
          <TableHead>Linehaul</TableHead>
          <TableHead>Payment Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loads.map((load) => (
          <TableRow key={load.load_id}>
            <TableCell>{load.load_number}</TableCell>
            <TableCell>{load.load_status}</TableCell>
            <TableCell>{load.broker}</TableCell>
            <TableCell>{load.origin_city + ", " + load.origin_state}</TableCell>
            <TableCell>
              {load.destination_city + ", " + load.destination_state}
            </TableCell>
            <TableCell>
              {new Date(load.pickup_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </TableCell>
            <TableCell>
              {Number(load.linehaul).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </TableCell>
            <TableCell>{load.payment_status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default LoadsPage;
