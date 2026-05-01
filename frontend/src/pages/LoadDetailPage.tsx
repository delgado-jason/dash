import { useLoad } from "@/hooks/useLoad";

export const LoadDetailPage = () => {
  const { load, isLoading, error } = useLoad(0);

  return (
    <div className="m-2">
      <div className="p-2 bg-gray-800 text-stone-50">Header</div>
      <div className="grid grid-cols-4">
        <div className="p-2 col-span-3 bg-gray-600 text-stone-50">
          Main Content
        </div>
        <div className="p-2 bg-gray-600 text-stone-50">Sidebar</div>
      </div>
    </div>
  );
};
