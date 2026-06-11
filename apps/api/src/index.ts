import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { clerkAuth } from "./middleware/auth";
import webhookRouter from "./routes/webhooks";
import userRouter from "./routes/users";
import notificationRouter from "./routes/notifications";
import teamRouter from "./routes/teams";
import invitationRouter from "./routes/invitations";

const app = express();
const port = process.env["PORT"] ?? 3001;

app.use(cors({ origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000" }));
app.use(morgan("dev"));

// Webhook routes need the raw body for svix signature verification
app.use("/webhooks", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(clerkAuth);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/webhooks", webhookRouter);
app.use("/users", userRouter);
app.use("/notifications", notificationRouter);
app.use("/teams", teamRouter);
app.use("/invitations", invitationRouter);

app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ error: err.message });
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
