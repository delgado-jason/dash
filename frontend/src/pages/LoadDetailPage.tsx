import { useState } from "react";
import { useLoad } from "@/hooks/useLoad";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const LoadDetailPage = () => {
  const [active, setActive] = useState("details");

  const { load, isLoading, error } = useLoad(0);
  console.log({ load });

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

  return (
    // CONTAINER
    <div className="m-2">
      <div className="p-4 bg-gray-800 text-stone-50">
        {/* LOAD IDENTIFIERS */}
        <div id="top-row" className="flex justify-between content-center">
          <div id="primary-identifier" className="text-2xl">
            <h3>{load.load_number}</h3>
          </div>
          <div id="subtitle" className="text-sm text-gray-300 self-center">
            <p>{`${load.broker} · ${load.agent} · ${capitalize(load.load_type)}`}</p>
          </div>
          <div id="badges" className="self-center">
            <Badge variant="default" className="bg-green-400">
              {load.load_status}
            </Badge>
            <Badge variant="secondary" className="bg-yellow-400">
              {load.payment_status}
            </Badge>
          </div>
          <div id="edit-delete-btns" className="cursor-pointer">
            <Button>Edit</Button>
            <Button>Delete</Button>
          </div>
        </div>
        {/* METRICS */}
        <div id="bottom-row" className="grid grid-cols-5 mt-4">
          <div>
            <p className="text-xs">Total Revenue</p>
            <h3>
              {(
                Number(load.linehaul) + Number(load.fuel_surcharge)
              ).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </h3>
          </div>
          <div>
            <p className="text-xs">Linehaul</p>
            <h3>
              {Number(load.linehaul).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </h3>
          </div>
          <div>
            <p className="text-xs">FSC</p>
            <h3>
              {Number(load.fuel_surcharge).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </h3>
          </div>
          <div>
            <p className="text-xs">RPM</p>
            <h3>
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
            <p className="text-xs">Loaded Miles</p>
            <h3>{Number(load.loaded_miles)}</h3>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4">
        {/* MAIN CONTENT */}
        <div className="p-2 col-span-3 bg-gray-600 text-stone-50">
          <Tabs defaultValue="details">
            <TabsList variant="line">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="accessorials">Accessorials</TabsTrigger>
              <TabsTrigger value="fuel">Fuel</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
            {/* DETAILS CONTENT */}
            <TabsContent value="details">
              <div className="grid grid-cols-2 pl-4 mt-4">
                {/* ROUTE CONTENT */}
                <div>
                  <div>
                    <p className="text-sm">Route</p>
                  </div>
                  <div className="flex content-center">
                    <div className="w-[10px] self-center mr-6">
                      <div
                        id="circle"
                        className="w-[8px] h-[8px] bg-stone-50 rounded-full"
                      ></div>
                    </div>
                    <div className="ml-6">
                      <p>
                        {load.origin_city}, {load.origin_state}
                      </p>
                      <p className="text-xs">{load.origin_market}</p>
                    </div>
                  </div>
                  <div className="border-l-2 border-blue-400 h-[15px] ml-[3px]"></div>
                  <div className="flex content-center">
                    <div className="w-[10px] self-center mr-6">
                      <div
                        id="circle"
                        className="w-[8px] h-[8px] bg-stone-50 rounded-full"
                      ></div>
                    </div>
                    <div className="ml-6">
                      <p>
                        {load.destination_city}, {load.destination_state}
                      </p>
                      <p className="text-xs">{load.delivery_market}</p>
                    </div>
                  </div>
                </div>
                {/* CARGO CONTENT */}
                <div>
                  <p className="text-sm">Cargo</p>
                  <div className="flex gap-6">
                    <div>
                      <p>Shipper</p>
                      <p>Receiver</p>
                      <p>Commodity</p>
                      <p>Weight</p>
                    </div>
                    <div>
                      <p>{load.shipper_name}</p>
                      <p>{load.receiver_name}</p>
                      <p>{load.commodity}</p>
                      <p>{load.weight}</p>
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
        <div className="p-2 bg-gray-600 text-stone-50">Sidebar</div>
      </div>
    </div>
  );
};
