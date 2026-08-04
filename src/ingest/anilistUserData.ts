import { importPlanToWatchList, importWatchedList } from "../anilist/lists.js";
import { AnilistUserImportSchema } from "../schemas/aniListUserData.js";
import { saveUserLists } from "../user/persist.js";
import { buildTaste } from "../user/taste.js";
import { FastifyReply, FastifyRequest } from "fastify";


export const anilistUserData = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const { username } = AnilistUserImportSchema.parse(request.body)

        const [watchedList, planToWatchList] = await Promise.all([
            importWatchedList(username),
            importPlanToWatchList(username),
        ]);

        const userId = await saveUserLists(username, {
            COMPLETED: watchedList,
            PLANNING: planToWatchList,
        });
        await buildTaste(userId);

        await reply.code(201).send({
            created: true,
            userId,
            completed: watchedList.length,
            planToWatch: planToWatchList.length,
        })
    }
    catch (err) {
        request.log.error(err);
        if (err instanceof Error) {
            await reply.code(400).send(err.message);
        }
    }
}
