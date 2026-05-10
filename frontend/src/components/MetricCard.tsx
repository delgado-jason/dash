import type { MetricCardFormat } from "@/types/metric";

interface MetricCardProps {
  label: string;
  value: number | string;
  format: MetricCardFormat;
}

const formatter = (
  value: string | number,
  formatOption: MetricCardFormat,
): string => {
  if (formatOption === "string") {
    return value.toString();
  }

  if (formatOption === "number") {
    return Number(value).toLocaleString();
  }

  if (formatOption === "currency") {
    return Number(value).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }

  if (formatOption === "percent") {
    return `${Number(value).toFixed(1)}%`;
  }

  return value.toString();
};

export const MetricCard = ({ label, value, format }: MetricCardProps) => {
  const formattedValue = formatter(value, format);

  return (
    <div className="font-body">
      <p className="text-xs font-condensed text-light uppercase tracking-wider">
        {label}
      </p>
      <p className="text-lg text-light">{formattedValue}</p>
    </div>
  );
};
