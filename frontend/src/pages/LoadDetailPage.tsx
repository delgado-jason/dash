import { useState } from "react";
import { useEffect } from "react";
import { useLoad } from "@/hooks/useLoad";

// Services
import { patchLoad } from "@/services/patchLoadService";

// UI Components
import { Badge } from "@/components/ui/badge";
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

export const LoadDetailPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { load, isLoading, error } = useLoad(refreshKey);
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

  return (
    // CONTAINER
    <div className="m-2 font-body">
      <div className="p-4 bg-steel text-light">
        {/* LOAD IDENTIFIERS */}
        <div id="top-row" className="flex justify-between content-center">
          <div id="primary-identifier" className="text-2xl font-display">
            <h3>{load.load_number}</h3>
          </div>
          <div id="subtitle" className="text-sm text-gray-300 self-center">
            <p>{`${load.broker} · ${load.agent} · ${capitalize(load.load_type)}`}</p>
          </div>
          <div id="badges" className="self-center">
            <StatusBadge value={load.load_status} />
            <StatusBadge value={load.payment_status} />
          </div>
          <div id="edit-delete-btns" className="cursor-pointer">
            <Button>Edit</Button>
            <Button>Delete</Button>
          </div>
        </div>
        {/* METRICS */}
        <div id="bottom-row" className="grid grid-cols-5 mt-4">
          <div>
            <p className="text-sm font-condensed">Total Revenue</p>
            <h3 className="text-lg">
              {(
                Number(load.linehaul) + Number(load.fuel_surcharge)
              ).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </h3>
          </div>
          <div>
            <p className="text-sm font-condensed">Linehaul</p>
            <h3 className="text-lg">
              {Number(load.linehaul).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </h3>
          </div>
          <div>
            <p className="text-sm font-condensed">FSC</p>
            <h3 className="text-lg">
              {Number(load.fuel_surcharge).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </h3>
          </div>
          <div>
            <p className="text-sm font-condensed">RPM</p>
            <h3 className="text-lg">
              {(
                (Number(load.linehaul) + Number(load.fuel_surcharge)) /
                Number(load.loaded_miles)
              ).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </h3>
          </div>
          <div>
            <p className="text-sm font-condensed">Loaded Miles</p>
            <h3 className="text-lg">{Number(load.loaded_miles)}</h3>
          </div>
        </div>
      </div>
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
              <TabsTrigger
                value="fuel"
                className="text-muted-text hover:text-light data-[state=active]:text-amber [&_after]:bg-amber"
              >
                Fuel
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="text-muted-text hover:text-light data-[state=active]:text-amber [&_after]:bg-amber"
              >
                Notes
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
                      <p className="mb-1 font-bold">Shipper</p>
                      <p className="mb-1 font-bold">Receiver</p>
                      <p className="mb-1 font-bold">Commodity</p>
                      <p className="mb-1 font-bold">Weight</p>
                    </div>
                    <div className="text-sm text-light">
                      <p className="mb-1">{load.shipper_name}</p>
                      <p className="mb-1">{load.receiver_name}</p>
                      <p className="mb-1">{load.commodity}</p>
                      <p className="mb-1">{load.weight}</p>
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
              </div>
            </TabsContent>
            {/* ACCESSORIALS CONTENT */}
            <TabsContent value="accessorials">
              Hello from accessorials
            </TabsContent>
            {/* FUEL CONTENT */}
            <TabsContent value="fuel">Hello from fuel</TabsContent>
            {/* NOTES CONTENT */}
            <TabsContent value="notes">Hello from notes</TabsContent>
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
