import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/authenticate.js';
import { getMyLists, addAnimeToList, removeAnimeFromList } from './routeHandlers/list.js';

export async function listRoutes(app: FastifyInstance) {
  app.get('/me/lists', { preHandler: authenticate }, getMyLists);
  app.post('/add/anime/:id', { preHandler: authenticate }, addAnimeToList);
  app.post('/remove/anime/:id', { preHandler: authenticate }, removeAnimeFromList);
}
