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
import accessorialRouter from "./routes/accessorialRoutes.js";
import fuelEntryRouter from "./routes/fuelEntryRoutes.js";
import brokerRouter from "./routes/brokerRoutes.js";
import agentRouter from "./routes/agentRoutes.js";
import marketRouter from "./routes/marketRoutes.js";
import agentNoteRoutes from "./routes/agentNoteRoutes.js";
import expenseRouter from "./routes/expenseRoutes.js";
import obligationRouter from "./routes/obligationRoutes.js";

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
app.use("/accessorials", accessorialRouter);
app.use("/fuel", fuelEntryRouter);
app.use("/brokers", brokerRouter);
app.use("/agents", agentRouter);
app.use("/markets", marketRouter);
app.use("/agents/:agent_id/notes", agentNoteRoutes);
app.use("/expenses", expenseRouter);
app.use("/obligations", obligationRouter);

app.get("/", (req, res) => {
  res.send("Home Page");
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
