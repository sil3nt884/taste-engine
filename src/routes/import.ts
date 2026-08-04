import type { FastifyInstance } from 'fastify';
import { anilistUserData } from "../ingest/anilistUserData.js";
import { myAnimeListUserData } from "../ingest/malUserData.js";

export async function importRoutes(app: FastifyInstance) {
  app.post('/import/user', anilistUserData);
  app.post('/import/myanimelist', myAnimeListUserData);
}
