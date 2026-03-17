import express from "express";
import "dotenv/config";
import cors from "cors";

import authRouter from "./routes/authRoutes.js";
import meRouter from "./routes/meRoutes.js";
import userRouter from "./routes/userRoutes.js";
import profileRouter from "./routes/profileRoutes.js";
import truckRouter from "./routes/truckRoutes.js";
import driverRouter from "./routes/driverRoutes.js";
import tripRouter from "./routes/tripRoutes.js";
import tripStopRouter from "./routes/tripStopRoutes.js";
import loadRouter from "./routes/loadRoutes.js";

const app = express();

// ---- MIDDLEWARE ----
app.use(cors());
app.use(express.json());

// ---- ROUTES ----

app.use("/auth", authRouter);
app.use("/", meRouter);
app.use("/users", userRouter);
app.use("/profiles", profileRouter);
app.use("/trucks", truckRouter);
app.use("/drivers", driverRouter);
app.use("/trips", tripRouter);
app.use("/stops", tripStopRouter);
app.use("/loads", loadRouter);

app.get("/", (req, res) => {
  res.send("Home Page");
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
