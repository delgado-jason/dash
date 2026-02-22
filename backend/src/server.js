import express from "express";
import "dotenv/config";

const app = express();

app.get("/", (req, res) => {
  res.send("Home Page");
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
