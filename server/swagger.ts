import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SmallBizAgent API',
      version: '1.0.0',
      description: 'API documentation for SmallBizAgent platform. Use these endpoints to integrate with the booking system, manage webhooks, and access public portals.',
      contact: {
        name: 'SmallBizAgent Support',
        email: 'bark@smallbizagent.ai',
      },
    },
    servers: [
      { url: process.env.APP_URL || 'http://localhost:5000', description: 'API Server' },
    ],
    components: {
      securitySchemes: {
        SessionAuth: { type: 'apiKey', in: 'cookie', name: 'connect.sid', description: 'Session-based authentication' },
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'API key authentication' },
      },
    },
    tags: [
      { name: 'Booking', description: 'Public booking endpoints' },
      { name: 'Webhooks', description: 'Webhook management' },
      { name: 'Portal', description: 'Customer-facing invoice/quote portals' },
      { name: 'Health', description: 'System health checks' },
    ],
  },
  apis: ['./server/routes/bookingRoutes.ts', './server/routes.ts'],
};

export function setupSwagger(app: Express) {
  const specs = swaggerJsdoc(options);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customSiteTitle: 'SmallBizAgent API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
  }));
  // Raw spec endpoint
  app.get('/api/docs/spec', (_req, res) => res.json(specs));
}
