import express from "express";
import "dotenv/config";

import authRouter from "./routes/authRoutes.js";
import userRouter from "./routes/userRoutes.js";
import profileRouter from "./routes/profileRoutes.js";

const app = express();

app.use(express.json());

app.use("/auth", authRouter);
app.use("/users", userRouter);
app.use("/profiles", profileRouter);

app.get("/", (req, res) => {
  res.send("Home Page");
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
