import { useState } from "react";
import { useEffect } from "react";
import { useLoad } from "@/hooks/useLoad";
import { useAccessorials } from "@/hooks/useAccessorials";

// Services
import { patchLoad } from "@/services/patchLoadService";
import { createAccessorial } from "@/services/createAccessorialService";

// UI Components
import { PageHeader } from "@/components/PageHeader";
import { MetricStrip } from "@/components/MetricStrip";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";

export const LoadDetailPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [accessorialsRefreshKey, setAccessorialsRefreshKey] = useState(0);
  const { load, isLoading, error } = useLoad(refreshKey);
  const {
    accessorials,
    isLoading: accessorialsIsLoading,
    error: accessorialsError,
  } = useAccessorials(accessorialsRefreshKey);
  const [newAccessorialType, setNewAccessorialType] = useState("");
  const [newAccessorialAmount, setNewAccessorialAmount] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [active, setActive] = useState("details");
  const [selectedLoadStatus, setSelectedLoadStatus] = useState("");
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState("");

  useEffect(() => {
    if (load) {
      setSelectedLoadStatus(load.load_status);
      setSelectedPaymentStatus(load.payment_status);
    }
  }, [load]);

  // Date format options
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };

  let totalAccessorialCharges = 0;
  accessorials.forEach((accessorial) => {
    totalAccessorialCharges += Number(accessorial.amount);
  });
  if (isLoading) {
    return (
      <div>
        <p>Loading</p>
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

  if (!load) {
    return null;
  }

  const capitalize = (str: string) => {
    let words = str.split(" ");
    let newStr = words.map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1),
    );
    newStr = newStr.join(" ");
    return newStr;
  };

  // HANDLERS
  const handleSaveChanges = async () => {
    const data = {
      load_status: selectedLoadStatus,
      payment_status: selectedPaymentStatus,
    };

    // Check if the state for the selects have changed
    if (
      data.load_status !== load.load_status ||
      data.payment_status !== load.payment_status
    ) {
      try {
        setIsSaving(true);
        await patchLoad(load.load_id, data);
        setRefreshKey((prev) => prev + 1);
      } catch {
        throw new Error("Unable to update status");
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleAddAccessorial = async () => {
    const data = {
      accessorial_type: capitalize(newAccessorialType),
      amount: Number(newAccessorialAmount),
    };

    if (data.accessorial_type !== "" && data.amount !== null) {
      try {
        await createAccessorial(load.load_id, data);
        setAccessorialsRefreshKey((prev) => prev + 1);
        setRefreshKey((prev) => prev + 1);
      } catch {
        throw new Error("Unable to create new accessorial");
      } finally {
        setNewAccessorialType("");
        setNewAccessorialAmount("");
      }
    }
  };

  return (
    // CONTAINER
    <div className="m-2 font-body">
      <PageHeader
        title={load.load_number}
        subtitle={`${load.broker} · ${load.agent} · ${capitalize(load.load_type)}`}
        badges={[{ value: load.load_status }, { value: load.payment_status }]}
        actions={
          <>
            <Button>Edit</Button>
            <Button>Delete</Button>
          </>
        }
        metrics={
          <MetricStrip
            cards={[
              {
                label: "Total Revenue",
                value: Number(load.linehaul) + Number(load.fuel_surcharge),
                format: "currency",
              },
              {
                label: "Linehaul",
                value: load.linehaul,
                format: "currency",
              },
              {
                label: "FSC",
                value: load.fuel_surcharge,
                format: "currency",
              },
              {
                label: "RPM",
                value:
                  (Number(load.linehaul) + Number(load.fuel_surcharge)) /
                  load.loaded_miles,
                format: "currency",
              },
              {
                label: "Loaded Miles",
                value: load.loaded_miles,
                format: "number",
              },
            ]}
          />
        }
      />
      <div className="grid grid-cols-4">
        {/* MAIN CONTENT */}
        <div className="p-2 col-span-3 bg-iron text-light">
          <Tabs defaultValue="details">
            <TabsList
              variant="line"
              className="w-full justify-start border-b border-plate"
            >
              <TabsTrigger
                value="details"
                className="text-muted-text hover:text-light data-[state=active]:text-amber [&_after]:bg-amber"
              >
                Details
              </TabsTrigger>
              <TabsTrigger
                value="accessorials"
                className="text-muted-text hover:text-light data-[state=active]:text-amber [&_after]:bg-amber"
              >
                Accessorials
              </TabsTrigger>
            </TabsList>
            {/* DETAILS CONTENT */}
            <TabsContent value="details">
              <div className="grid grid-cols-2 pl-4 mt-4 mb-8 gap-y-8">
                {/* ROUTE CONTENT */}
                <div className="border-b-2 border-plate pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-text mb-3">
                      Route
                    </p>
                  </div>
                  <div className="flex content-center">
                    <div className="w-[10px] self-center mr-6">
                      <div
                        id="circle"
                        className="w-[8px] h-[8px] bg-light rounded-full"
                      ></div>
                    </div>
                    <div className="ml-6 text-sm text-light font-bold">
                      <p>
                        {load.origin_city}, {load.origin_state}
                      </p>
                      <p className="text-xs text-light">{load.origin_market}</p>
                    </div>
                  </div>
                  <div className="border-l-2 border-plate h-[15px] ml-[3px]"></div>
                  <div className="flex content-center">
                    <div className="w-[10px] self-center mr-6">
                      <div
                        id="circle"
                        className="w-[8px] h-[8px] bg-light rounded-full"
                      ></div>
                    </div>
                    <div className="ml-6 text-sm text-light font-bold">
                      <p>
                        {load.destination_city}, {load.destination_state}
                      </p>
                      <p className="text-xs text-light">
                        {load.delivery_market}
                      </p>
                    </div>
                  </div>
                </div>
                {/* CARGO CONTENT */}
                <div className="border-b-2 border-plate">
                  <p className="text-xs uppercase tracking-wider text-muted-text mb-3">
                    Cargo
                  </p>
                  <div className="flex gap-6">
                    <div className="text-sm text-light">
                      <p className="mb-1 font-bold">Commodity</p>
                      <p className="mb-1 font-bold">Weight</p>
                      <p className="mb-1 font-bold">Dimensions</p>
                    </div>
                    <div className="text-sm text-light">
                      <p className="mb-1">{load.commodity}</p>
                      <p className="mb-1">{load.weight}</p>
                      <p className="mb-1">
                        {!load.dimensions ? "Legal" : load.dimensions}
                      </p>
                    </div>
                  </div>
                </div>
                {/* DATES CONTENT */}
                <div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-text mb-3">
                      Dates
                    </p>
                    <div className="grid grid-cols-2">
                      <div>
                        <p className="text-muted-text mb-2 text-sm">Pickup</p>
                        <p className="text-muted-text text-sm">Delivery</p>
                      </div>
                      <div>
                        <p className="text-light mb-2 text-sm">
                          {new Date(load.pickup_date).toLocaleDateString(
                            "en-US",
                            dateOptions,
                          )}
                        </p>
                        <p className="text-light text-sm">
                          {new Date(load.delivery_date).toLocaleDateString(
                            "en-US",
                            dateOptions,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {/* MILEAGE CONTENT */}
                <div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-text mb-3">
                      Mileage
                    </p>
                  </div>
                  <div className="grid grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-text mb-2">Loaded</p>
                      <p className="text-sm text-muted-text mb-2">Deadhead</p>
                      <p className="text-sm text-muted-text mb-2">
                        Odometer Start
                      </p>
                      <p className="text-sm text-muted-text">Odometer End</p>
                    </div>
                    <div>
                      <p className="text-sm text-light mb-2">
                        {load.loaded_miles} mi
                      </p>
                      <p className="text-sm text-light mb-2">
                        {load.deadhead_miles} mi
                      </p>
                      <p className="text-sm text-light mb-2">
                        {load.odometer_start?.toLocaleString()}
                      </p>
                      <p className="text-sm text-light">
                        {load.odometer_end?.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
                {/* SHIPPER & RECEIVER CONTENT */}
                <div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-text mb-3">
                      Shipper & Receiver
                    </p>
                    <div className="grid grid-cols-2">
                      <div>
                        <p className="text-muted-text mb-2 text-sm">Shipper</p>
                        <p className="text-muted-text text-sm">Receiver</p>
                      </div>
                      <div>
                        <p className="text-light mb-2 text-sm">
                          {load.shipper_name}
                        </p>
                        <p className="text-light text-sm">
                          {load.receiver_name}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {/* FUEL CONTENT */}
                <div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-text mb-3">
                      Fuel <StatusBadge value="est" />
                    </p>
                    <div className="grid grid-cols-2">
                      <div>
                        <p className="text-muted-text mb-2 text-sm">
                          Est. Cost
                        </p>
                        <p className="text-muted-text mb-2 text-sm">Avg MPG</p>
                        <p className="text-muted-text text-sm">Fuel Price</p>
                      </div>
                      <div>
                        <p className="text-light mb-2 text-sm">
                          {(
                            ((load.loaded_miles + load.deadhead_miles) / 6.5) *
                            5.5
                          ).toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                          })}
                        </p>
                        <p className="text-light text-sm mb-2">6.5</p>
                        <p className="text-light text-sm mb-2">$5.50/gal</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            {/* ACCESSORIALS CONTENT */}
            <TabsContent value="accessorials">
              {accessorials.length === 0 ? (
                <p>No accessorials for current load</p>
              ) : (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-text mb-3 mt-4 pl-4">
                    Charges
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-2 border-plate">
                        <TableHead className="text-muted-text text-sm pl-4">
                          Type
                        </TableHead>
                        <TableHead className="text-muted-text text-sm">
                          Amount
                        </TableHead>
                        <TableHead className="text-muted-text text-sm text-center">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accessorials.map((accessorial) => (
                        <TableRow
                          key={accessorial.accessorial_id}
                          className="border-b-2 border-plate"
                        >
                          <TableCell className="text-sm text-light pl-4">
                            {accessorial.accessorial_type}
                          </TableCell>
                          <TableCell>
                            {Number(accessorial.amount).toLocaleString(
                              "en-US",
                              {
                                style: "currency",
                                currency: "USD",
                              },
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Pencil
                                size={14}
                                className="text-muted-text hover:text-light cursor-pointer"
                              />
                              <Trash2
                                size={14}
                                className="text-red-400 hover:text-red-300 cursor-pointer"
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="grid grid-cols-3 border-t-2 border-plate">
                    <p className="text-sm text-light pl-4 pt-2">
                      Total Accessorials
                    </p>
                    <p className="text-sm text-light pt-2">
                      {totalAccessorialCharges.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex justify-center mt-8">
                <div className="bg-steel p-6 w-3/4 self-center rounded-md">
                  <div className="grid grid-cols-3 gap-x-6 gap-y-2">
                    <p className="text-xs text-muted-text">Type</p>
                    <p className="text-xs text-muted-text">Amount</p>
                    <div></div>
                    <input
                      id="new-accessorial-type"
                      name="new-accessorial-type"
                      placeholder="e.g. Layover"
                      className="p-2 bg-plate rounded-md"
                      value={newAccessorialType}
                      onChange={(e) => setNewAccessorialType(e.target.value)}
                    />
                    <input
                      id="new-accessorial-amount"
                      name="new-accessorial-amount"
                      placeholder="0.00"
                      className="p-2 bg-plate rounded-md"
                      value={newAccessorialAmount}
                      onChange={(e) => setNewAccessorialAmount(e.target.value)}
                    />
                    <Button
                      className="bg-steel border-1 border-light"
                      onClick={handleAddAccessorial}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
        {/* SIDEBAR */}
        <div className="p-2 bg-iron border-l-1 border-plate text-light">
          <div className="border-b-1 border-plate pl-2 pr-2 pb-4">
            <p className="text-xs text-muted-text mt-2 mb-2 uppercase tracking-wider">
              Broker & Agent
            </p>
            <p className="text-sm text-light">{load.broker}</p>
            <p className="text-sm text-muted-text">{load.agent}</p>
            <p className="text-sm text-muted-text">{load.agent_email}</p>
          </div>
          <div className="border-b-1 border-plate pl-2 pr-2">
            <p className="text-xs text-muted-text mt-2 mb-2 uppercase tracking-wider">
              Load Status
            </p>
            <Select
              value={selectedLoadStatus}
              onValueChange={(value) => setSelectedLoadStatus(value)}
            >
              <SelectTrigger className="mb-4">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="tonu">Tonu</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-text mt-2 mb-2 uppercase tracking-wider">
              Payment Status
            </p>
            <Select
              value={selectedPaymentStatus}
              onValueChange={(value) => setSelectedPaymentStatus(value)}
            >
              <SelectTrigger className="mb-4">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="invoiced">Invoiced</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="border-b-1 border-plate pl-2 pr-2 pb-4">
            <p className="text-xs text-muted-text mt-2 mb-2 uppercase tracking-wider">
              Revenue
            </p>
            <div className="grid grid-cols-2">
              <div>
                <p className="text-sm text-muted-text">Linehaul</p>
                <p className="text-sm text-muted-text">FSC</p>
                <p className="text-sm text-muted-text">Accessorials</p>
              </div>
              <div>
                <p className="text-sm text-light">
                  {Number(load.linehaul).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </p>
                <p className="text-sm text-light">
                  {Number(load.fuel_surcharge).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </p>
                <p className="text-sm text-light">
                  {Number(load.total_accessorials).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </p>
              </div>
            </div>
          </div>
          <div className="pt-2 pl-2 pr-2 pb-4 grid grid-cols-2">
            <div>
              <p className="text-sm text-light">Total</p>
            </div>
            <div>
              <p className="text-light">
                {(
                  Number(load.total_accessorials) +
                  Number(load.linehaul) +
                  Number(load.fuel_surcharge)
                ).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </p>
            </div>
          </div>
          <Button
            disabled={isSaving}
            className="border-2 border-amber text-light hover:cursor-pointer hover:scale-105"
            onClick={handleSaveChanges}
          >
            {isSaving ? "...Saving" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
};
