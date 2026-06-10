import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { clerkAuth } from "./middleware/auth";
import webhookRouter from "./routes/webhooks";
import userRouter from "./routes/users";

const app = express();
const port = process.env["PORT"] ?? 3001;

app.use(cors({ origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000" }));
app.use(morgan("dev"));

// Raw body needed for svix webhook signature verification
app.use("/webhooks", express.raw({ type: "application/json" }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.body = JSON.parse(req.body.toString());
  }
  next();
});

app.use(express.json());
app.use(clerkAuth);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/webhooks", webhookRouter);
app.use("/users", userRouter);

app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ error: err.message });
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
