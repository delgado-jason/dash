// Poster number formats — compact on purpose, the tiles are small.
export const kMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
export const num = (n: number) => Math.round(n).toLocaleString("en-US");
