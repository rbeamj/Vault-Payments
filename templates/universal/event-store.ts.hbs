// GENERATED FILE — do not edit by hand.
//
// Durable webhook event store.
//
// Uses Node's built-in SQLite so the generated project keeps zero runtime
// dependencies. The event id carries a PRIMARY KEY, which is what makes
// dedupe real: `ON CONFLICT DO NOTHING` returns zero changes for a repeat
// delivery, so a retried webhook can never be processed twice.

import { DatabaseSync } from 'node:sqlite';

export interface StoredEvent {
  eventId: string;
  type: string;
  payload: string;
  status: 'pending' | 'processed' | 'failed';
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  received_at  TEXT NOT NULL,
  processed_at TEXT,
  error        TEXT
);
`;

export class EventStore {
  readonly #db: DatabaseSync;
  readonly #insert;
  readonly #markProcessed;
  readonly #markFailed;
  readonly #selectOne;
  readonly #selectAll;

  constructor(path: string = 'vault-payments-events.db') {
    this.#db = new DatabaseSync(path);
    this.#db.exec(SCHEMA);

    this.#insert = this.#db.prepare(
      `INSERT INTO webhook_events (event_id, type, payload, received_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(event_id) DO NOTHING`,
    );
    this.#markProcessed = this.#db.prepare(
      `UPDATE webhook_events SET status = 'processed', processed_at = ? WHERE event_id = ?`,
    );
    this.#markFailed = this.#db.prepare(
      `UPDATE webhook_events SET status = 'failed', error = ? WHERE event_id = ?`,
    );
    this.#selectOne = this.#db.prepare(
      `SELECT event_id, type, payload, status, received_at, processed_at, error
       FROM webhook_events WHERE event_id = ?`,
    );
    this.#selectAll = this.#db.prepare(
      `SELECT event_id, type, payload, status, received_at, processed_at, error
       FROM webhook_events ORDER BY received_at DESC`,
    );
  }

  /**
   * Record an event durably.
   *
   * Returns true when the event was newly stored, false when it already
   * existed — the caller treats false as "already handled, acknowledge and
   * move on".
   */
  record(eventId: string, type: string, payload: string): boolean {
    const result = this.#insert.run(eventId, type, payload, new Date().toISOString());
    return result.changes > 0;
  }

  markProcessed(eventId: string): void {
    this.#markProcessed.run(new Date().toISOString(), eventId);
  }

  markFailed(eventId: string, error: string): void {
    this.#markFailed.run(error, eventId);
  }

  get(eventId: string): StoredEvent | null {
    const row = this.#selectOne.get(eventId);
    return row ? this.#toEvent(row) : null;
  }

  list(): StoredEvent[] {
    return this.#selectAll.all().map((row) => this.#toEvent(row));
  }

  count(): number {
    const row = this.#db.prepare('SELECT COUNT(*) AS n FROM webhook_events').get();
    return Number((row as { n: number | bigint }).n);
  }

  close(): void {
    this.#db.close();
  }

  #toEvent(row: Record<string, unknown>): StoredEvent {
    return {
      eventId: String(row['event_id']),
      type: String(row['type']),
      payload: String(row['payload']),
      status: String(row['status']) as StoredEvent['status'],
      receivedAt: String(row['received_at']),
      processedAt: row['processed_at'] === null ? null : String(row['processed_at']),
      error: row['error'] === null ? null : String(row['error']),
    };
  }
}
