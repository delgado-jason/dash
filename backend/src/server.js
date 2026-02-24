import express from "express";
import "dotenv/config";

import userRouter from "./routes/userRoutes.js";

const app = express();

app.use(express.json());

app.use("/users", userRouter);

app.get("/", (req, res) => {
  res.send("Home Page");
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
