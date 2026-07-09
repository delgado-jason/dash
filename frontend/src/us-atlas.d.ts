// us-atlas ships TopoJSON data files; import the topology as an untyped object
// and let topojson-client's feature() give it shape at the call site.
declare module "us-atlas/states-10m.json" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topology: any;
  export default topology;
}
