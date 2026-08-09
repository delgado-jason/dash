import { Suspense, lazy, useMemo } from "react";
import { Coin, type CoinMetal } from "@/components/forge/Coin";

// The coin, made real — a slowly turning machined piece for the strike
// ceremony and feature spots. R3F rides the same lazy three chunk the Lanes
// board established; anything without WebGL gets the 2D coin. This is the
// jewel-box use of 3D: one small canvas, one mesh, spent on the win moment.
const CoinScene = lazy(() => import("./CoinScene"));

const webglOK = (): boolean => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

export const Coin3D = ({
  metal,
  size = 116,
  label,
}: {
  metal: CoinMetal;
  size?: number;
  label: string;
}) => {
  const gl = useMemo(webglOK, []);
  if (!gl)
    return (
      <Coin metal={metal} size={size}>
        {label}
      </Coin>
    );
  return (
    <Suspense
      fallback={
        <Coin metal={metal} size={size}>
          {label}
        </Coin>
      }
    >
      <CoinScene metal={metal} size={size} label={label} />
    </Suspense>
  );
};
