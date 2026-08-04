import type { FastifyInstance } from 'fastify';
import { searchCatalogEntries } from './routeHandlers/catalog.js';

export async function catalogRoutes(app: FastifyInstance) {
  app.post('/searchCatalog', searchCatalogEntries);
}
