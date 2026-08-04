import type { FastifyInstance } from 'fastify';
import { listMedia, getMediaEntry } from './routeHandlers/media.js';

export async function mediaRoutes(app: FastifyInstance) {
  app.get('/media', listMedia);
  app.get('/media/:id', getMediaEntry);
}
