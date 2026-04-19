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

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

const TripsPage = () => {
  const { trips, isLoading, error } = useTrips();
  const navigate = useNavigate();
  const [tripDate, setTripDate] = useState("");

  const handleEditClick = (tripId: string) => {
    if (tripId) {
      navigate(`/trips/${tripId}`);
    }
  };

  const handleTripDateChange = (e) => {
    setTripDate(e.target.value);
  };

  console.log(tripDate);

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
      <div className="flex justify-between bg-slate-200">
        <div className="bg-slate-200 pb-6 pl-4 font-semibold">
          <h1 className="text-2xl">Trips</h1>
        </div>
        <div className="pr-4 bg-slate-200">
          {/* <Button
            size="sm"
            className="bg-green-400 text-sm text-slate-600 shadow-sm hover:cursor-pointer hover:scale-110 hover:bg-green-300"
          >
            Create
          </Button> */}
          <Dialog>
            <form>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="bg-green-400 text-sm text-slate-600 shadow-sm hover:cursor-pointer hover:scale-105 hover:bg-green-500"
                >
                  Create Trip
                </Button>
              </DialogTrigger>
              <DialogContent className="xl:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Create Trip</DialogTitle>
                  <DialogDescription>
                    Build your route with stops
                  </DialogDescription>
                </DialogHeader>
                <FieldGroup className="flex flex-row">
                  <Field>
                    <Label htmlFor="load-date">Load Date</Label>
                    <Input
                      type="date"
                      id="load-date"
                      name="load-date"
                      value={tripDate}
                      onChange={handleTripDateChange}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="truck">Select Truck</Label>
                    <Select defaultValue="">
                      <SelectTrigger id="select-truck">
                        <SelectValue placeholder="" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="Truck A">A</SelectItem>
                          <SelectItem value="Truck B">B</SelectItem>
                          <SelectItem value="Truck C">C</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <Label htmlFor="truck">Select Driver</Label>
                    <Select defaultValue="">
                      <SelectTrigger id="select-driver">
                        <SelectValue placeholder="" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="Driver A">A</SelectItem>
                          <SelectItem value="Driver B">B</SelectItem>
                          <SelectItem value="Driver C">C</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <Label htmlFor="truck">Select Status</Label>
                    <Select defaultValue="">
                      <SelectTrigger id="select-status">
                        <SelectValue placeholder="" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="Planned">Planned</SelectItem>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Complete">Complete</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                <FieldGroup className="flex flex-row">
                  <Field>
                    <Label htmlFor="odometer-start">Odometer Start</Label>
                    <Input
                      type="number"
                      id="odometer-start"
                      name="odometer-start"
                      value=""
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="odometer-end">Odometer End</Label>
                    <Input
                      type="number"
                      id="odometer-end"
                      name="odometer-end"
                      value=""
                    />
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="submit">Save changes</Button>
                </DialogFooter>
              </DialogContent>
            </form>
          </Dialog>
        </div>
      </div>
      <Table className="border-2 border-slate-300">
        <TableHeader className="rounded-t-md">
          <TableRow className="text-xs font-extrabold">
            <TableHead className="w-[100px] text-center font-extrabold">
              Trip #
            </TableHead>
            <TableHead className="text-center font-extrabold">
              Trip Date
            </TableHead>
            <TableHead className="text-center font-extrabold">
              Driver Name
            </TableHead>
            <TableHead className="text-center font-extrabold">Unit #</TableHead>
            <TableHead className="text-center font-extrabold">Status</TableHead>
            <TableHead className="text-center font-extrabold">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-xs">
          {trips.map((trip) => (
            <TableRow key={trip.trip_id}>
              <TableCell className="font-medium text-center">
                {trip.trip_number}
              </TableCell>
              <TableCell className="text-center">{trip.trip_date}</TableCell>
              <TableCell className="text-center">{trip.driver_name}</TableCell>
              <TableCell className="text-center">{trip.unit_number}</TableCell>
              <TableCell className="text-center">{trip.trip_status}</TableCell>
              <TableCell className="flex p-2 justify-center">
                <div className="border-r-2 pr-2 pl-2">
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
