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
import facilityRouter from "./routes/facilityRoutes.js";
import perDiemRouter from "./routes/perDiemRoutes.js";
import agentNoteRoutes from "./routes/agentNoteRoutes.js";
import expenseRouter from "./routes/expenseRoutes.js";
import obligationRouter from "./routes/obligationRoutes.js";
import maintenanceRouter from "./routes/maintenanceRoutes.js";
import trailerRouter from "./routes/trailerRoutes.js";
import avatarRouter from "./routes/avatarRoutes.js";
import complianceRouter from "./routes/complianceRoutes.js";
import trophyRouter from "./routes/trophyRoutes.js";
import settlementScheduleRouter from "./routes/settlementScheduleRoutes.js";
import accessorialRateRouter from "./routes/accessorialRateRoutes.js";

const app = express();

// ---- MIDDLEWARE ----
// Expose the sliding-session header so the browser can read the refreshed token.
app.use(cors({ exposedHeaders: ["X-Refreshed-Token"] }));
app.use(express.json());

// Everything this API returns is per-user, authenticated JSON, and some responses
// carry the sliding-session X-Refreshed-Token header. Express caches by default
// (ETag on, no Cache-Control), so the browser was storing those responses AND
// that header — then replaying a long-dead token out of the HTTP cache over a
// freshly issued one, which is what booted people straight back to /login.
// Nothing here is cacheable, so say so at the source. ETags go too: their only
// job is the revalidation we no longer want.
app.disable("etag");
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

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
app.use("/facilities", facilityRouter);
app.use("/per-diem", perDiemRouter);
app.use("/agents/:agent_id/notes", agentNoteRoutes);
app.use("/expenses", expenseRouter);
app.use("/obligations", obligationRouter);
app.use("/maintenance", maintenanceRouter);
app.use("/compliance", complianceRouter);
app.use("/trophies", trophyRouter);
app.use("/trailers", trailerRouter);
app.use("/avatars", avatarRouter);
app.use("/settlement-schedule", settlementScheduleRouter);
app.use("/accessorial-rates", accessorialRateRouter);

app.get("/", (req, res) => {
  res.send("Home Page");
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
