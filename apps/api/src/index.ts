import express, { Request, Response, NextFunction } from "express";
import { prisma } from "./lib/prisma";

import teamsRouter from "./routes/teams";
import usersRouter from "./routes/users";
import invitationsRouter from "./routes/invitations";
import walletsRouter from "./routes/wallets";
import tournamentsRouter from "./routes/tournaments";
import notificationsRouter from "./routes/notifications";
import webhooksRazorpayRouter from "./routes/webhooks";
import webhooksClerkRouter from "./routes/clerks";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Capture raw body for webhook signature verification before JSON parse
app.use(
  (req: Request & { rawBody?: string }, _res: Response, next: NextFunction) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on("end", () => {
      req.rawBody = raw;
      next();
    });
  }
);

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// API routes
app.use("/teams", teamsRouter);
app.use("/users", usersRouter);
app.use("/invitations", invitationsRouter);
app.use("/wallets", walletsRouter);
app.use("/tournaments", tournamentsRouter);
app.use("/notifications", notificationsRouter);
app.use("/webhooks", webhooksRazorpayRouter);
app.use("/webhooks", webhooksClerkRouter);

// Global error handler
app.use(
  (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
);

async function main() {
  try {
    await prisma.$connect();
    console.log("Database connected");
  } catch (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Zytaa API running on port ${PORT}`);
  });
}

main();
