import express from "express";
import cors from "cors";
import { loadEnv } from "@aviles/core/env";
import { stationsRouter } from "./routes/stations.ts";

loadEnv();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use("/stations", stationsRouter);

const port = Number(process.env.API_PORT ?? 3001);
app.listen(port, () => {
  console.log(`[api] http://localhost:${port}`);
});
