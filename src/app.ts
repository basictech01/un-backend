import { ApolloServer } from '@apollo/server';
import http from "http";
import cookieParser from "cookie-parser";
import { PORT, CORS_ORIGIN } from './config/env.ts';
import { connectToDatabase } from './database/db.ts';
import express from 'express';
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from '@as-integrations/express5';
import { limiter } from './middleware/ratelimit.middleware.ts';
import cors from 'cors';
import { buildGraphQL } from './graphql/loaders/graphql.loader.ts';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.ts';
import helmet from 'helmet';
import createLogger from './utils/logger.ts';

const logger = createLogger('@app');

async function startServer() {
    const { typeDefs, resolvers } = buildGraphQL();

    const app = express();
    const httpServer = http.createServer(app);

    // Trust proxy (required when behind nginx/reverse proxy)
    app.set('trust proxy', 1);

    // Security middleware
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    app.use(cors({
        origin: CORS_ORIGIN,
        credentials: true
    }));

    // Rate limit
    app.use(limiter);

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(cookieParser());

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });

    // Root endpoint
    app.get('/', (_, res) => {
        res.json({
            success: true,
            message: 'Uttrakhand Next Backend API is running 🏔️',
            graphql: `http://localhost:${PORT}/graphql`
        });
    });

    // Initialize Apollo Server
    const apollo = new ApolloServer({
        typeDefs,
        resolvers,
        plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
        introspection: true,
    });

    await apollo.start();

    // GraphQL endpoint
    app.use(
        "/graphql",
        express.json(),
        expressMiddleware(apollo, {
            context: async ({ req }) => ({ req, user: req.user ?? null }),
        })
    );

    // Connect to database
    await connectToDatabase();

    // Error handlers (must be last)  
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Start server
    httpServer.listen(PORT, () => {
        logger.info(`🚀 Uttrakhand Next Backend started on port ${PORT}`);
        logger.info(`📍 Health check: http://localhost:${PORT}/health`);
        logger.info(`🎯 GraphQL endpoint: http://localhost:${PORT}/graphql`);
    });
}

startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
