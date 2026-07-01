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
import { optionalAuth } from './middleware/auth.middleware.ts';
import { createLoaders } from './graphql/loaders/user.loader.ts';
import uploadRouter from './routes/upload.route.ts';

async function startServer() {
    const { typeDefs, resolvers } = buildGraphQL();

    const app = express();
    const httpServer = http.createServer(app);

    app.use(cors({
        origin: CORS_ORIGIN,
        credentials: false
    }));
    app.use(limiter);
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(cookieParser());
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));

    app.get('/health', (req, res) => {
        res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });
    app.get('/', (_, res) => {
        res.json({
            success: true,
            message: 'uttrakhand next api is running'
        });
    });

    const apollo = new ApolloServer({
        typeDefs,
        resolvers,
        plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    });

    await apollo.start();
    app.use(
        "/graphql",
        express.json(),
        optionalAuth,
        expressMiddleware(apollo, {
            context: async ({ req }) => ({ req, user: req.user ?? null, loaders: createLoaders() }),
        })
    );

    // REST routes
    app.use('/api/upload', uploadRouter);

    await connectToDatabase();

    app.use(notFoundHandler);
    app.use(errorHandler);

    httpServer.listen(PORT);
    console.log(`Server is running on port ${PORT}`);
    console.log(`GraphQL endpoint is running on http://localhost:${PORT}/graphql`);
}

startServer();
