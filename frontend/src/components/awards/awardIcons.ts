import {
  Banknote,
  Route,
  Mountain,
  Coins,
  Dumbbell,
  Gauge,
  MapPin,
  ArrowLeftRight,
  Layers,
  Medal,
  Boxes,
  Flame,
  Unlock,
  Trophy,
  type LucideIcon,
} from "lucide-react";

// The award catalogs use plain icon names; map them to lucide here so patches and
// medals share one vocabulary.
const MAP: Record<string, LucideIcon> = {
  cash: Banknote,
  road: Route,
  mountain: Mountain,
  coins: Coins,
  barbell: Dumbbell,
  gauge: Gauge,
  "map-pin": MapPin,
  "arrows-horizontal": ArrowLeftRight,
  "layers-subtract": Layers,
  medal: Medal,
  "stack-2": Boxes,
  flame: Flame,
  "lock-open": Unlock,
  trophy: Trophy,
};

export const awardIcon = (name: string): LucideIcon => MAP[name] ?? Trophy;
