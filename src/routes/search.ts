import type { FastifyInstance } from 'fastify';
import { searchRecommendations, searchWhys } from './routeHandlers/search.js';

export async function searchRoutes(app: FastifyInstance) {
  app.post('/search', searchRecommendations);
  app.post('/search/why', searchWhys);
}
