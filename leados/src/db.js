import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const file = process.env.LEADOS_DB ?? new URL('../data/leados.db', import.meta.url).pathname;
if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS managers (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    team            TEXT,
    calendar_source TEXT,             -- 'demo' | 'google' | NULL (not connected)
    google_tokens   TEXT,             -- JSON; read-only calendar scope
    connected_at    TEXT
  );

  -- Only title, time and attendee count are stored: never descriptions, attendees' names or meeting content.
  CREATE TABLE IF NOT EXISTS events (
    id             INTEGER PRIMARY KEY,
    manager_id     INTEGER NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
    ext_id         TEXT NOT NULL,
    title          TEXT NOT NULL,
    start_utc      TEXT NOT NULL,
    end_utc        TEXT NOT NULL,
    attendee_count INTEGER NOT NULL DEFAULT 1,
    moment_type    TEXT,              -- NULL = not a leadership moment
    UNIQUE (manager_id, ext_id)
  );
  CREATE INDEX IF NOT EXISTS events_by_time ON events (manager_id, start_utc);

  CREATE TABLE IF NOT EXISTS preps (
    event_id   INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    focus      TEXT NOT NULL,
    questions  TEXT NOT NULL,         -- JSON array of strings
    source     TEXT NOT NULL,         -- 'claude' | 'library'
    opened_at  TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS captures (
    id         INTEGER PRIMARY KEY,
    event_id   INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
    manager_id INTEGER NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
    rating     TEXT CHECK (rating IN ('well', 'mixed', 'hard')),
    next_step  TEXT CHECK (next_step IN ('none', 'follow_up', 'revisit')),
    note       TEXT,                  -- private to the manager; never leaves the manager views
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lookbacks (
    id            INTEGER PRIMARY KEY,
    manager_id    INTEGER NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
    week_start    TEXT NOT NULL,
    pillar_scores TEXT NOT NULL,      -- JSON {pillarId: 1..5}, the "manager-said" side of a later comparison
    win           TEXT,
    try_next      TEXT,
    updated_at    TEXT NOT NULL,
    UNIQUE (manager_id, week_start)
  );
`);

export const now = () => new Date().toISOString();
