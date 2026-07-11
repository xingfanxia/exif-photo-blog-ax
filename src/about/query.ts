import { sql } from '@/platforms/db';
import { About, AboutInsert } from '.';
import { safelyQuery } from '@/db/query';
import camelcaseKeys from 'camelcase-keys';

const ABOUT_ID = 1;

export const createAboutTable = () =>
  sql`
    CREATE TABLE IF NOT EXISTS about (
      id INTEGER PRIMARY KEY,
      title TEXT,
      subhead TEXT,
      description TEXT,
      photo_id_avatar TEXT REFERENCES photos(id),
      photo_id_hero TEXT REFERENCES photos(id),
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `;

export const upsertAbout = (about: AboutInsert) =>
  safelyQuery(() => sql`
    INSERT INTO about (
      id,
      title,
      subhead,
      description,
      photo_id_avatar,
      photo_id_hero,
      updated_at,
      created_at
    ) VALUES (
      ${ABOUT_ID},
      ${about.title},
      ${about.subhead},
      ${about.description},
      ${about.photoIdAvatar},
      ${about.photoIdHero},
      ${new Date().toISOString()},
      ${new Date().toISOString()}
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      subhead = EXCLUDED.subhead,
      description = EXCLUDED.description,
      photo_id_avatar = EXCLUDED.photo_id_avatar,
      photo_id_hero = EXCLUDED.photo_id_hero,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    RETURNING id
  `.then(({ rows }) => rows[0]?.id as number)
  , 'insertAbout');

export const getAbout = () =>
  safelyQuery(() => sql`
    SELECT * FROM about LIMIT 1
  `.then(({ rows }) => rows[0]
      ? camelcaseKeys(
        rows[0] as unknown as Record<string, unknown>,
      ) as unknown as About
      : undefined,
    )
  , 'getAbout');
