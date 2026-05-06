import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || join(__dirname, '..', 'uploads');

mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  // Surface a typed multer error so the global handler returns 400 with a
  // clean message instead of silently dropping the file (the previous
  // cb(null, false) behaviour). multer 2.x passes this through next(err)
  // automatically — no route change needed.
  const err = new Error(`Unsupported file type: ${file.mimetype}`);
  err.name = 'MulterError';
  err.code = 'LIMIT_UNEXPECTED_FILE';
  cb(err, false);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

export { uploadDir };
