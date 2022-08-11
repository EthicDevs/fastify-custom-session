// std
import { URL } from "url";
// 3rd-party
import debug from "debug";
import { Client as PgClient } from "pg";
import { default as PgPool } from "pg-pool";
// lib
import type { CustomSession, ISessionStoreAdapter, Session } from "../types";
import { generateUniqSerial } from "../serial";

interface PostgresSessionAdapterOptions {
  databaseUrl: string;
  pgPool?: PgPool<PgClient>;
  schemaName?: string; // @default public
  tableName?: string; // @default sessions
}

const logTrace = debug("postgresSessionAdapter:trace");
const logError = debug("postgresSessionAdapter:error");

function escapeSqlQuotes(str: string): string {
  return str.replace('"', "`");
}

/**
 * /!\ WIP - Not working yet - WIP /!\
 */
export class PostgresSessionAdapter implements ISessionStoreAdapter {
  private options: PostgresSessionAdapterOptions;
  private dbPool: PgPool<PgClient>;

  constructor(options: PostgresSessionAdapterOptions) {
    const connectionParams = new URL(options.databaseUrl);
    const sslMode = connectionParams.searchParams.get("sslmode");
    const config: PgPool.Config<PgClient> = {
      user: connectionParams.username,
      password: connectionParams.password,
      host: connectionParams.hostname,
      port: parseInt(connectionParams.port, 10),
      database: connectionParams.pathname.split("/")[1],
      ssl: sslMode != null && sslMode !== "disable",
    };
    this.dbPool =
      options.pgPool != null ? options.pgPool : new PgPool(config, PgClient);
    this.options = options;
  }

  async createSession(
    sessionData: CustomSession,
    metas: {
      detectedIPAddress?: string | undefined;
      detectedUserAgent: string;
    },
  ): Promise<Session> {
    const nowDate = new Date(Date.now());
    const sessionId = generateUniqSerial();
    const session: Session = {
      id: sessionId,
      createdAtEpoch: nowDate.getTime(),
      updatedAtEpoch: nowDate.getTime(),
      expiresAtEpoch: null,
      data: sessionData,
      metas: {
        detectedIPAddress: metas.detectedIPAddress || "",
        detectedUserAgent: metas.detectedUserAgent,
      },
      async destroy() {
        return false;
      },
      async reload() {
        return undefined;
      },
      async save() {
        return undefined;
      },
    };
    const { reload, save, destroy, ...safeSession } = session;
    try {
      const client = await this.dbPool.connect();
      const tableName = escapeSqlQuotes(JSON.stringify(this.options.tableName));
      const schema = escapeSqlQuotes(JSON.stringify(this.options.schemaName));
      const result = await client.query(
        `INSERT INTO ${schema}.${tableName} (
          id, sid, created_at_unix, updated_at_unix,
          expires_at_unix, serialized_data, ip_address, user_agent
        ) VALUES (
          null, $1::text, to_timestamp($2::int), to_timestamp($3::int),
          to_timestamp($4::int), $5::jsonb, $6::text, $7::text
        ) RETURNING sid;`,
        [
          session.id,
          session.createdAtEpoch,
          session.updatedAtEpoch,
          session.expiresAtEpoch,
          session.data,
          session.metas.detectedIPAddress,
          session.metas.detectedUserAgent,
        ],
      );
      const success = result.rowCount > 0;
      if (success) {
        logTrace("Created session =>", sessionId, safeSession);
      } else {
        logError("Could not create session =>", sessionId, safeSession, result);
      }
      client.release();
      return session;
    } catch (err) {
      logError("Could not create session =>", sessionId, safeSession, err);
      throw err;
    }
  }

  async readSessionById(sessionId: string): Promise<Session | null> {
    try {
      const client = await this.dbPool.connect();
      const tableName = escapeSqlQuotes(JSON.stringify(this.options.tableName));
      const schema = escapeSqlQuotes(JSON.stringify(this.options.schemaName));
      const result = await client.query(
        `SELECT * FROM ${schema}.${tableName} WHERE sid = $1::text;`,
        [sessionId],
      );
      const success = result.rowCount > 0;
      if (!success) {
        logError("Could not read session =>", sessionId);
        client.release();
        return null;
      }
      const session: Session | null = null;
      logTrace("Read session =>", sessionId, session, result);
      client.release();
      return session;
    } catch (err) {
      logError("Could not create session =>", sessionId, err);
      throw err;
    }
  }

  async updateSessionById(
    _sessionId: string,
    _session: Session,
  ): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  async deleteSessionById(_sessionId: string): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
}
