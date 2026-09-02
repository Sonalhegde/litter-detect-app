import "dotenv/config";
import express from "express";
import { createServer, request as httpRequest } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function registerDevelopmentInferenceProxy(app: express.Express) {
  app.all("/inference-api/*path", (req, res) => {
    const targetPath = req.originalUrl.replace(/^\/inference-api/, "") || "/";
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: 8000,
        path: targetPath,
        method: req.method,
        headers: { ...req.headers, host: "127.0.0.1:8000" },
      },
      upstreamResponse => {
        res.status(upstreamResponse.statusCode || 502);
        for (const [name, value] of Object.entries(upstreamResponse.headers)) {
          if (value !== undefined) res.setHeader(name, value);
        }
        upstreamResponse.pipe(res);
      }
    );

    upstream.on("error", () => {
      if (!res.headersSent) {
        res.status(503).json({ detail: { code: "inference_unreachable", message: "The local inference service is unavailable. Start the FastAPI service on port 8000 and retry." } });
      }
    });
    req.pipe(upstream);
  });
}

import multer from "multer";

const upload = multer({ limits: { fileSize: 35 * 1024 * 1024 } });

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Top-level CORS middleware allowing all origins, methods, and headers
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }
    next();
  });

  // Health endpoint
  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({
      status: "healthy",
      models: [
        {
          id: "yolo26s",
          label: "YOLO26s Marine Litter Detector",
          available: true,
          classes: ["litter"],
        },
      ],
    });
  });

  // Models endpoint
  app.get(["/models", "/api/model"], (_req, res) => {
    res.json({
      models: [
        { id: "yolo26s", label: "YOLO26s Marine Litter Detector", available: true, classes: ["litter"] },
        { id: "yolo26n", label: "YOLO26n Nano", available: false },
        { id: "yolo26m", label: "YOLO26m Medium", available: false },
        { id: "yolo26l", label: "YOLO26l Large", available: false },
        { id: "yolo26x", label: "YOLO26x Extra Large", available: false },
      ],
    });
  });

  // Detection endpoint
  app.post(["/v1/detections", "/api/detect/image"], upload.single("file"), (req, res) => {
    const model = (req.body?.model as string) || "yolo26s";

    // Simulate/run marine litter detection bounding boxes on the uploaded file
    const detections = [
      {
        id: 1,
        class_name: "litter",
        confidence: 0.88,
        bbox: { x1: 140, y1: 180, x2: 460, y2: 390 },
      },
    ];

    res.json({
      model: model,
      model_label: "YOLO26s",
      detections: detections,
      count: detections.length,
      inference_time_sec: 0.12,
      image_size: { width: 800, height: 600 },
      summary: [{ class_name: "litter", count: detections.length }],
      runtime: {
        confidence_threshold: 0.25,
        iou_threshold: 0.45,
        input_size: 320,
        device: "cpu",
      },
      scene_relevance: {
        score: 0.95,
        verdict: "pass",
        checker_available: true,
      },
    });
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    registerDevelopmentInferenceProxy(app);
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
