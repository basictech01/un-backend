import winston from "winston";
import fs from "fs";
import path from "path";

// Use absolute path for logs directory (works in Docker and local)
const LOGS_DIR = process.env.LOGS_DIR || path.resolve(process.cwd(), "logs");

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function createLogger(label: string): winston.Logger {
    return winston.createLogger({
        level: "debug",
        format: winston.format.combine(
            winston.format.label({ label }),
            winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" })
        ),
        transports: [
            // Console output
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(
                        (info) =>
                            `[${info.label}] ${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`
                    )
                ),
            }),

            // File output
            new winston.transports.File({
                dirname: LOGS_DIR,
                filename: "app.log",
                maxsize: 100 * 1024 * 1024, // 100MB
                maxFiles: 10,
                level: "debug",
                format: winston.format.printf(
                    (info) =>
                        `[${info.label}] ${info.timestamp} ${info.level}: ${info.message}`
                ),
            }),
        ],
    });
}

export default createLogger;
