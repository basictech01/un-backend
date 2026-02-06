import mysql from "mysql2/promise";
import { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, NODE_ENV } from "../config/env.ts";
import createLogger from "../utils/logger.ts";

const logger = createLogger("@db");

export const db = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: DB_PORT,
    waitForConnections: true,
    connectionLimit: 20,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
});

export const connectToDatabase = async (retries = 10, delay = 3000): Promise<void> => {
    // Basic retry loop for initial connection
    // This keeps trying for a while before failing hard
    // so containerized deployments have time for MySQL to come up
    // (e.g. Docker Compose)
    while (retries > 0) {
        try {
            const connection = await db.getConnection();
            await connection.ping();
            connection.release();

            logger.info(`✅ MySQL pool connected successfully in ${NODE_ENV}`);
            return;
        } catch (error) {
            retries -= 1;
            logger.warn(`⚠️ MySQL connection failed. Retries left: ${retries}`);

            if (retries === 0) {
                logger.error("❌ Could not connect to MySQL after multiple attempts");
                throw error;
            }

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
};

export const gracefulShutdown = async (): Promise<void> => {
    logger.info("🔄 Shutting down database connections...");

    try {
        await db.end();
        logger.info("✅ Database connections closed successfully");
    } catch (error) {
        logger.error("❌ Error during database shutdown:", error as Error);
    }
};
