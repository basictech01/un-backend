import { db } from '../../database/db.ts';

export const healthResolvers = {
    Query: {
        health: async () => {
            try {
                // Test database connection
                await db.query('SELECT 1');
                return {
                    status: 'OK',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: '1.0.0',
                    database: 'Connected',
                };
            } catch (error) {
                return {
                    status: 'ERROR',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: '1.0.0',
                    database: 'Disconnected',
                };
            }
        },
        hello: () => {
            return 'Hello from Uttrakhand Next Backend! 🏔️';
        },
    },
};
