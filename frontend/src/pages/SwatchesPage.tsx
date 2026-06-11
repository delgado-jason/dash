export const SwatchesPage = () => {
  const swatches = [
    {
      color: "var(--chart-1)",
      label: "chart 1",
    },
    {
      color: "var(--chart-2)",
      label: "chart 2",
    },
    {
      color: "var(--chart-3)",
      label: "chart 3",
    },
    {
      color: "var(--chart-4)",
      label: "chart 4",
    },
    {
      color: "var(--chart-5)",
      label: "chart 5",
    },
  ];

  return (
    <div className="flex gap-3 m-4">
      {swatches.map((swatch, i) => (
        <div key={i}>
          <div
            style={{
              backgroundColor: swatch.color,
              width: "100px",
              height: "100px",
            }}
          ></div>
          <p>{swatch.label}</p>
        </div>
      ))}
    </div>
  );
};
