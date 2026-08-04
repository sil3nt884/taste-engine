import { createHash } from 'node:crypto';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function inputFingerprint(parts: {
  vocabularyVersion: number;
  modelId: string;
  title: string;
  synopsis: string;
  communityTags: string;
}): string {
  return sha256(
    [
      `v${parts.vocabularyVersion}`,
      parts.modelId,
      parts.title.trim(),
      parts.synopsis.trim(),
      parts.communityTags.trim(),
    ].join('␟'), // unit separator — cannot occur in the inputs
  );
}
