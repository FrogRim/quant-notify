import "./loadEnv";
import express, { type Request } from "express";
import { createServer } from "node:http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import usersRouter from "./routes/users";
import sessionsRouter from "./routes/sessions";
import callsRouter from "./routes/calls";
import workersRouter from "./routes/workers";
import reportsRouter from "./routes/reports";
import billingRouter from "./routes/billing";
import { attachMediaStreamServer } from "./mediaStream";
import { mediaRuntime } from "./mediaRuntime";
import { store } from "./storage/inMemoryStore";
import { classifyMediaStreamFailureReason } from "./callFaultClassifier";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.set("trust proxy", 1);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.length === 0) {
        if (process.env.NODE_ENV === "production") {
          callback(new Error("CORS: ALLOWED_ORIGINS not configured"));
          return;
        }
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS: origin not allowed"));
      }
    },
    credentials: true
  })
);

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "rate_limited", message: "too many requests" } }
});

app.use(globalLimiter);

app.use(
  express.json({
    verify: (req: Request, _res, buffer) => {
      if (buffer && buffer.length > 0) {
        (req as Request & { rawBody?: string }).rawBody = buffer.toString("utf8");
      }
    }
  })
);
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "lingua-call-api",
    requestId: "health-" + Date.now()
  });
  return;
});

app.use("/users", usersRouter);
app.use("/sessions", sessionsRouter);
app.use("/calls", callsRouter);
app.use("/workers", workersRouter);
app.use("/reports", reportsRouter);
app.use("/billing", billingRouter);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: { code: "not_found", message: `No route found: ${req.method} ${req.path}` }
  });
});

const server = createServer(app);
const enableTwilioMediaStream =
  process.env.ENABLE_TWILIO_MEDIA_STREAM === "true" ||
  process.env.CALL_PROVIDER === "twilio";

if (enableTwilioMediaStream) {
  attachMediaStreamServer(server, {
    onInboundAudio: async (frame) => {
      await mediaRuntime.handleInboundAudio(frame);
    },
    onStreamClose: (sessionId) => {
      if (!sessionId) {
        return;
      }
      mediaRuntime.clearSession(sessionId);
    },
    onStreamFault: async (sessionId, reason, details) => {
      if (!sessionId) {
        return;
      }
      const failureReason = classifyMediaStreamFailureReason(reason, details?.code);
      await store.markSessionTerminal(sessionId, "provider_error", failureReason).catch(() => undefined);
      await store.markMediaStreamError(sessionId, "media_stream_fault", {
        reason,
        details,
        at: new Date().toISOString()
      }).catch(() => undefined);
    }
  });
}

server.listen(PORT, () => {
  process.stdout.write(`LinguaCall API listening on :${PORT}\n`);
});

export default app;
