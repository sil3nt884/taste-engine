import { Kafka, type EachMessagePayload } from 'kafkajs';
import { config } from '../config.js';
import { ensureCatalogIndex, indexMedia, removeMedia } from '../search/catalogIndex.js';
import type { DebeziumPayload } from '../types';

type RawEvent = {
  op?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};
const OP_BY_CODE: Record<string, DebeziumPayload['op']> = {
  c: 'create', u: 'update', d: 'delete', r: 'read',
};

function affectedMedia(table: string, p: DebeziumPayload): { id: string; deleted: boolean } | null {
  if (table === 'media') {
    if (p.op === 'delete') {
      return p.before?.id != null ? { id: String(p.before.id), deleted: true } : null;
    }
    return p.after?.id != null ? { id: String(p.after.id), deleted: false } : null;
  }
  const mediaId = p.after?.media_id ?? p.before?.media_id;
  return mediaId != null ? { id: String(mediaId), deleted: false } : null;
}

export async function runCatalogSync(): Promise<void> {
  await ensureCatalogIndex();

  const kafka = new Kafka({
    clientId: 'taste-catalog-sync',
    brokers: config.KAFKA_BROKERS.split(',').map((broker) => broker.trim()),
  });
  const consumer = kafka.consumer({ groupId: 'taste-catalog-sync' });
  await consumer.connect();

  const prefix = config.CDC_TOPIC_PREFIX;
  const topics = [`${prefix}.public.media`, `${prefix}.public.media_tag`, `${prefix}.public.media_genre`];
  for (const topic of topics) await consumer.subscribe({ topic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }: EachMessagePayload) => {
      if (!message.value) return;   // tombstone
      let event: { payload?: RawEvent } & RawEvent;
      try {
        event = JSON.parse(message.value.toString());
      } catch {
        return;
      }
      // Debezium may wrap in {schema, payload} or emit the payload directly, and
      // uses single-letter op codes — normalise to our named union.
      const wire = event.payload ?? event;
      const payload: DebeziumPayload = {
        op: wire.op ? OP_BY_CODE[wire.op] : undefined,
        before: wire.before ?? null,
        after: wire.after ?? null,
      };
      if (!payload.op) return;   // no op, or an unrecognised code

      const table = topic.split('.').pop()!;
      const target = affectedMedia(table, payload);
      if (!target) return;

      try {
        if (target.deleted) await removeMedia([target.id]);
        else await indexMedia([target.id]);
      } catch (err) {
        console.warn(`catalog sync ${topic} #${target.id} failed: ${(err as Error).message}`);
      }
    },
  });

  console.log(`catalog sync running — consuming ${topics.join(', ')}`);
}
