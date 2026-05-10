import { ReactNode } from "react";
import type { Badge } from "@/types/badge";
import { StatusBadge } from "@/components/StatusBadge";

interface PageHeaderProps {
  title: string;
  subtitle: string;
  badges: Badge[];
  actions?: ReactNode;
  metrics?: ReactNode;
}

export const PageHeader = ({
  title,
  subtitle,
  badges,
  actions,
  metrics,
}: PageHeaderProps) => {
  return (
    <div className="p-4 bg-steel text-light">
      {/* LOAD IDENTIFIERS */}
      <div id="top-row" className="flex justify-between content-center">
        <div id="primary-identifier" className="text-2xl font-display">
          <h3>{title}</h3>
        </div>
        <div id="subtitle" className="text-sm text-gray-300 self-center">
          <p>{subtitle}</p>
        </div>
        <div id="badges" className="self-center">
          {badges.map((badge, index) => (
            <StatusBadge key={index} value={badge.value} />
          ))}
        </div>
        <div id="edit-delete-btns" className="cursor-pointer">
          {actions}
        </div>
      </div>
      <div>{metrics}</div>
    </div>
  );
};
