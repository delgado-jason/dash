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
import planRouter from "./routes/planRoutes.js";
import cashflowRouter from "./routes/cashflowRoutes.js";
import agentContactRouter from "./routes/agentContactRoutes.js";
import agentCoverageRouter from "./routes/agentCoverageRoutes.js";
import agentNotesRouter from "./routes/agentNotesRoutes.js";
import trailerRouter from "./routes/trailerRoutes.js";
import avatarRouter from "./routes/avatarRoutes.js";
import complianceRouter from "./routes/complianceRoutes.js";
import trophyRouter from "./routes/trophyRoutes.js";
import settlementScheduleRouter from "./routes/settlementScheduleRoutes.js";
import accessorialRateRouter from "./routes/accessorialRateRoutes.js";
import routingRouter from "./routes/routingRoutes.js";
import freightIndexRouter from "./routes/freightIndexRoutes.js";
import vendorRouter from "./routes/vendorRoutes.js";
import documentRouter from "./routes/documentRoutes.js";
import settlementRouter from "./routes/settlementRoutes.js";
import cityCoordsRouter from "./routes/cityCoordsRoutes.js";
import agentTierHistoryRouter from "./routes/agentTierHistoryRoutes.js";
import relationshipReviewRouter from "./routes/relationshipReviewRoutes.js";

const app = express();

// ---- MIDDLEWARE ----
// Expose the sliding-session header so the browser can read the refreshed token.
app.use(cors({ exposedHeaders: ["X-Refreshed-Token"] }));
app.use(express.json({ limit: "1mb" })); // settlement feeds carry up to 500 lines

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
// Literal path first: the agent router's GET /:agent_id would otherwise read
// "tier-history" as an agent id.
app.use("/agents/tier-history", agentTierHistoryRouter);
app.use("/agents", agentRouter);
app.use("/relationship-reviews", relationshipReviewRouter);
app.use("/markets", marketRouter);
app.use("/facilities", facilityRouter);
app.use("/per-diem", perDiemRouter);
app.use("/agents/:agent_id/notes", agentNoteRoutes);
app.use("/expenses", expenseRouter);
app.use("/obligations", obligationRouter);
app.use("/maintenance", maintenanceRouter);
app.use("/plans", planRouter);
app.use("/cashflow", cashflowRouter);
app.use("/agent-contacts", agentContactRouter);
app.use("/agent-coverage", agentCoverageRouter);
app.use("/agent-notes", agentNotesRouter);
app.use("/compliance", complianceRouter);
app.use("/trophies", trophyRouter);
app.use("/trailers", trailerRouter);
app.use("/avatars", avatarRouter);
app.use("/settlement-schedule", settlementScheduleRouter);
app.use("/accessorial-rates", accessorialRateRouter);
app.use("/routing", routingRouter);
app.use("/freight-index", freightIndexRouter);
app.use("/vendors", vendorRouter);
app.use("/documents", documentRouter);
app.use("/settlements", settlementRouter);
app.use("/city-coords", cityCoordsRouter);

// ---- HEALTH / VERSION ----
// Deliberately UNAUTHENTICATED and cheap: the question "which commit is
// actually serving traffic?" must be answerable from a script, a monitor, or a
// rollback decision at 2am — none of which can log in. Without this, the only
// way to tell whether a deploy landed is to exercise the behaviour that
// changed, which requires being a user.
//
// Railway injects the RAILWAY_* variables automatically. `started` is the one
// that distinguishes "deployed" from "deployed but crash-looping on the old
// build" — a process that keeps restarting shows a start time that keeps
// moving. Nothing here is a secret: a commit sha and an uptime.
const STARTED_AT = new Date().toISOString();

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.RAILWAY_GIT_BRANCH ?? null,
    deployment: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
    started: STARTED_AT,
    uptime_s: Math.round(process.uptime()),
  });
});

app.get("/", (req, res) => {
  res.send("Home Page");
});

const PORT = process.env.PORT || 3000; // env-first: the future VPS cutover picks the port

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
