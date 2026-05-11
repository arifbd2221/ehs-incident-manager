import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { existsSync } from 'fs';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import incidentRoutes from './routes/incidents.js';
import affectedPersonsRoutes from './routes/affected_persons.js';
import investigationRoutes from './routes/investigations.js';
import capaRoutes from './routes/capas.js';
import reportRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import attachmentRoutes from './routes/attachments.js';
import userRoutes from './routes/users.js';
import siteRoutes from './routes/sites.js';
import workHoursRoutes from './routes/work_hours.js';
import assetRoutes from './routes/assets.js';
import assetCategoryRoutes from './routes/asset_categories.js';
import maintenanceRoutes from './routes/maintenance.js';
import linkRoutes from './routes/links.js';
import documentRoutes from './routes/documents.js';
import folderRoutes from './routes/folders.js';
import templateRoutes from './routes/templates.js';
import answerSetRoutes from './routes/answer_sets.js';
import inspectionRoutes from './routes/inspections_routes.js';
import {
  incidentScopedRouter as overrideIncidentRoutes,
  globalRouter as overrideGlobalRoutes,
} from './routes/override_requests.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const defaultOrigins = ['http://localhost:5173', 'http://localhost:3001'];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : defaultOrigins;

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    if (status >= 400) {
      console.log(`[${status}] ${req.method} ${req.originalUrl} — ${ms}ms`);
    }
  });
  next();
});

app.use('/api/auth', authRoutes);

app.use('/api/incidents', authMiddleware, incidentRoutes);
// WI-A: multi-person CRUD lives on the same /api/incidents prefix so the
// REST paths read as /incidents/:id/affected-persons[/:apId[/injuries[/:injuryId]]].
// Express dispatches to whichever router has a matching route — the two
// routers don't share paths.
app.use('/api/incidents', authMiddleware, affectedPersonsRoutes);
// WI-B: incident-scoped POST/GET lives on /api/incidents (matches the
// affected-persons idiom); global pending-queue + decision routes live
// on /api/override-requests. Two routers to keep paths unambiguous.
app.use('/api/incidents', authMiddleware, overrideIncidentRoutes);
app.use('/api/override-requests', authMiddleware, overrideGlobalRoutes);
app.use('/api/investigations', authMiddleware, investigationRoutes);
app.use('/api/capas', authMiddleware, capaRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/attachments', authMiddleware, attachmentRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/sites', authMiddleware, siteRoutes);
app.use('/api/work-hours', authMiddleware, workHoursRoutes);
app.use('/api/assets', authMiddleware, assetRoutes);
app.use('/api/asset-categories', authMiddleware, assetCategoryRoutes);
app.use('/api/maintenance-schedules', authMiddleware, maintenanceRoutes);
app.use('/api/links', authMiddleware, linkRoutes);
app.use('/api/documents', authMiddleware, documentRoutes);
app.use('/api/folders', authMiddleware, folderRoutes);
app.use('/api/templates', authMiddleware, templateRoutes);
app.use('/api/answer-sets', authMiddleware, answerSetRoutes);
app.use('/api/inspections', authMiddleware, inspectionRoutes);

app.use('/uploads', express.static(join(__dirname, 'uploads')));

const clientDist = join(__dirname, '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production' && existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
