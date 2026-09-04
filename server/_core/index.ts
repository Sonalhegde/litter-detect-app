import "dotenv/config";
import express from "express";
import { createServer, request as httpRequest } from "http";
import net from "net";
import os from "os";
import fs from "fs";
import { execFile } from "child_process";
import path from "path";
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

  // Detection endpoint using native ONNX Runtime (best.pt / yolo26s.onnx) neural network model inference
  app.post(["/v1/detections", "/api/detect/image"], upload.single("file"), async (req, res) => {
    const file = req.file;
    const model = (req.body?.model as string) || "yolo26s";

    if (!file || !file.buffer) {
      res.status(400).json({ detail: { code: "empty_file", message: "The selected image is empty." } });
      return;
    }

    try {
      // 1. Run real YOLO26s (best.pt) neural network model inference via onnxruntime-node
      const { runOnnxInference } = await import("./onnxInference");
      const result = await runOnnxInference(file.buffer, model);
      res.json(result);
      return;
    } catch (onnxErr) {
      console.error("Native ONNX inference error:", onnxErr);
    }

    // 2. Python CLI fallback if native node ONNX runtime is unavailable
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `sentinal_upload_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
    try {
      await fs.promises.writeFile(tmpPath, file.buffer);
      const rootDir = path.resolve(import.meta.dirname, "../..");
      const pythonExecs = [
        path.join(rootDir, "backend", ".venv", "Scripts", "python.exe"),
        path.join(rootDir, "backend", ".venv", "bin", "python"),
        "python3",
        "python",
      ];
      const scriptPath = path.join(rootDir, "backend", "run_inference.py");

      for (const pyExec of pythonExecs) {
        try {
          const stdoutData = await new Promise<string>((resolve, reject) => {
            execFile(pyExec, [scriptPath, tmpPath, model], { cwd: path.join(rootDir, "backend"), timeout: 15000 }, (err, stdout) => {
              if (err || !stdout) reject(err);
              else resolve(stdout);
            });
          });
          if (stdoutData) {
            const parsed = JSON.parse(stdoutData.trim());
            if (!parsed.error) {
              await fs.promises.unlink(tmpPath).catch(() => {});
              res.json(parsed);
              return;
            }
          }
        } catch {
          continue;
        }
      }
      await fs.promises.unlink(tmpPath).catch(() => {});
    } catch {}

    // 3. No model result — report an honest failure. Never fabricate detections.
    res.status(503).json({
      detail: {
        code: "model_unavailable",
        message: "The detection model could not be run for this image. No results were produced.",
      },
    });
  });

  // Anti-Analyzer / input relevance gate — validates the upload and reports
  // whether a relevance verdict is available. This Node deployment has no
  // scene-classification model, so the honest verdict is "unavailable" —
  // a service limitation, never a claim that the image is unrelated.
  app.post("/v1/relevance", upload.single("file"), async (req, res) => {
    const file = req.file;
    const startedAt = Date.now();

    if (!file || !file.buffer || file.size === 0) {
      res.status(400).json({ detail: { code: "empty_file", message: "The selected image is empty." } });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      res.status(413).json({ detail: { code: "file_too_large", message: "Images must be 8 MB or smaller." } });
      return;
    }

    // Format sniff on magic bytes — never trust the client-declared MIME type
    const buf = file.buffer;
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isWebp = buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
    if (!isJpeg && !isPng && !isWebp) {
      res.status(415).json({ detail: { code: "unsupported_image_format", message: "Upload a JPEG, PNG, or WebP image." } });
      return;
    }

    // Real decode via sharp — corrupted images are rejected, dimensions come from the actual bitmap
    let width = 0;
    let height = 0;
    try {
      const { default: sharp } = await import("sharp");
      const meta = await sharp(buf).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
      if (!width || !height) throw new Error("no dimensions");
      if (width > 3000 || height > 3000 || width * height > 6_000_000) {
        res.status(413).json({ detail: { code: "image_dimensions_exceeded", message: "Images may be at most 3000 × 3000 pixels and 6 megapixels." } });
        return;
      }
    } catch {
      res.status(415).json({ detail: { code: "invalid_image", message: "The selected file could not be read as a supported image." } });
      return;
    }

    console.log(
      `relevance request=${Date.now()} bytes=${file.size} image=${width}x${height} status=unavailable duration_ms=${Date.now() - startedAt}`
    );

    res.json({
      input: { valid: true, width, height },
      relevance: { status: "unavailable", score: null, checker_available: false },
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
