import { z } from 'zod';

export const MalUserImportSchema = z.object({
  username: z.string().min(1).max(50),
});
