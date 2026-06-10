import cors from "cors";
import express, { NextFunction, Request, Response } from "express";

const deliberateLintError = "CI gate test — this unused variable should fail CI";
import morgan from "morgan";

const app = express();
const port = process.env["PORT"] ?? 3001;

app.use(cors({ origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000" }));
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ error: err.message });
});

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
