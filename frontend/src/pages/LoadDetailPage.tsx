import { useLoad } from "@/hooks/useLoad";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Currency } from "lucide-react";

export const LoadDetailPage = () => {
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
    <div className="m-2">
      <div className="p-4 bg-gray-800 text-stone-50">
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
                (Number(load.loaded_miles) + Number(load.deadhead_miles))
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
        <div className="p-2 col-span-3 bg-gray-600 text-stone-50">
          Main Content
        </div>
        <div className="p-2 bg-gray-600 text-stone-50">Sidebar</div>
      </div>
    </div>
  );
};
