import type { FastifyInstance } from 'fastify';
import { signUpUser, loginUser } from './routeHandlers/auth.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/signup', signUpUser);
  app.post('/login', loginUser);
}
