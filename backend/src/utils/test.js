const patch = {
  status: "active",
  current_odometer: 300000,
  user_id: "bad id",
  truck_id: "580991kl290",
  is_deleted: true,
};

const restrictedFields = ["user_id", "truck_id", "is_deleted"];

console.log(
  patch.filter((column, restrictedFields) => {
    column !== restrictedFields;
  }),
);
