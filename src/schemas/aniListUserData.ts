import { z } from 'zod';


export const AnilistUserImportSchema = z.object({
    username: z.string()
});

