import type { FastifyReply, FastifyRequest } from "fastify";
import { MalUserImportSchema } from "../schemas/malUserData.js";
import { importMyAnimeList } from "./malImport.js";

export const myAnimeListUserData = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const { username } = MalUserImportSchema.parse(request.body);

        const result = await importMyAnimeList(username);

        await reply.code(201).send({
            created: true,
            ...result,
        });
    }
    catch (err) {
        request.log.error(err);
        if (err instanceof Error) {
            await reply.code(400).send(err.message);
        }
    }
}
