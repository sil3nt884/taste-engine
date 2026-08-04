import Fastify from 'fastify';
import {importRoutes} from "./routes/import.js";
import {searchRoutes} from "./routes/search.js";
import {authRoutes} from "./routes/auth.js";
import {listRoutes} from "./routes/list.js";
import {catalogRoutes} from "./routes/catalog.js";
import {mediaRoutes} from "./routes/media.js";

const app = Fastify({
    logger: true
})

await app.register(importRoutes);
await app.register(searchRoutes);
await app.register(authRoutes);
await app.register(listRoutes);
await app.register(catalogRoutes);
await app.register(mediaRoutes);

await app.listen({port: 8080, host: '0.0.0.0'});
