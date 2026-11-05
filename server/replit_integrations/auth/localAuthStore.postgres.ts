import type { PoolClient } from "pg";
import { pool } from "../../db";
import type { LocalAuthAccount, LocalAuthRecipient, LocalAuthRepository } from "./localAuthService";

type QueryResultRow = Record<string, unknown>;

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

export class PostgresLocalAuthRepository implements LocalAuthRepository {
  async createPendingAccount(input: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string | null;
    passwordHash: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const client = await pool.connect();
    const email = input.email.normalize("NFKC").trim().toLowerCase();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [email]);
      const existing = await client.query(
        "SELECT 1 FROM users WHERE lower(btrim(email)) = $1 LIMIT 1",
        [email],
      );
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }

      await client.query(
        `INSERT INTO users (id, email, first_name, last_name)
         VALUES ($1, $2, $3, $4)`,
        [input.userId, email, input.firstName, input.lastName],
      );
      await client.query(
        `INSERT INTO local_auth_credentials (user_id, email_normalized, password_hash)
         VALUES ($1, $2, $3)`,
        [input.userId, email, input.passwordHash],
      );
      await client.query(
        `INSERT INTO local_auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'verify_email', $3)`,
        [input.userId, input.tokenHash, input.expiresAt],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await rollback(client);
      // An exact duplicate can still reach a unique constraint from an
      // out-of-band writer. Keep public responses indistinguishable from the
      // ordinary duplicate-account path.
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    } finally {
      client.release();
    }
  }

  async createEmailVerificationToken(email: string, tokenHash: string, expiresAt: Date): Promise<LocalAuthRecipient | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<QueryResultRow>(
        `SELECT c.user_id, u.email, u.first_name, u.last_name
         FROM local_auth_credentials c
         JOIN users u ON u.id = c.user_id
         WHERE c.email_normalized = $1 AND c.email_verified_at IS NULL
         FOR UPDATE OF c`,
        [email],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      const userId = String(row.user_id);
      await client.query(
        `UPDATE local_auth_tokens SET consumed_at = now()
         WHERE user_id = $1 AND purpose = 'verify_email' AND consumed_at IS NULL`,
        [userId],
      );
      await client.query(
        `INSERT INTO local_auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'verify_email', $3)`,
        [userId, tokenHash, expiresAt],
      );
      await client.query("COMMIT");
      return recipientFromRow(row);
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeEmailVerificationToken(tokenHash: string, now: Date): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<QueryResultRow>(
        `SELECT t.id, c.user_id
         FROM local_auth_tokens t
         JOIN local_auth_credentials c ON c.user_id = t.user_id
         WHERE t.token_hash = $1 AND t.purpose = 'verify_email'
           AND t.consumed_at IS NULL AND t.expires_at > $2
           AND c.email_verified_at IS NULL
         FOR UPDATE OF t, c`,
        [tokenHash, now],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query("UPDATE local_auth_tokens SET consumed_at = $2 WHERE id = $1", [row.id, now]);
      await client.query(
        "UPDATE local_auth_credentials SET email_verified_at = $2, updated_at = $2 WHERE user_id = $1",
        [row.user_id, now],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async findByEmail(email: string): Promise<LocalAuthAccount | null> {
    const result = await pool.query<QueryResultRow>(
      `SELECT c.user_id, c.email_normalized, c.password_hash, c.email_verified_at,
              u.first_name, u.last_name
       FROM local_auth_credentials c
       JOIN users u ON u.id = c.user_id
       WHERE c.email_normalized = $1
       LIMIT 1`,
      [email],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      userId: String(row.user_id),
      email: String(row.email_normalized),
      passwordHash: String(row.password_hash),
      emailVerifiedAt: row.email_verified_at ? new Date(String(row.email_verified_at)) : null,
      firstName: row.first_name === null ? null : String(row.first_name),
      lastName: row.last_name === null ? null : String(row.last_name),
    };
  }

  async createPasswordResetToken(email: string, tokenHash: string, expiresAt: Date): Promise<LocalAuthRecipient | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<QueryResultRow>(
        `SELECT c.user_id, u.email, u.first_name, u.last_name
         FROM local_auth_credentials c
         JOIN users u ON u.id = c.user_id
         WHERE c.email_normalized = $1 AND c.email_verified_at IS NOT NULL
         FOR UPDATE OF c`,
        [email],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      const userId = String(row.user_id);
      await client.query(
        `UPDATE local_auth_tokens SET consumed_at = now()
         WHERE user_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL`,
        [userId],
      );
      await client.query(
        `INSERT INTO local_auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'password_reset', $3)`,
        [userId, tokenHash, expiresAt],
      );
      await client.query("COMMIT");
      return recipientFromRow(row);
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async consumePasswordResetToken(tokenHash: string, passwordHash: string, now: Date): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<QueryResultRow>(
        `SELECT t.id, c.user_id
         FROM local_auth_tokens t
         JOIN local_auth_credentials c ON c.user_id = t.user_id
         WHERE t.token_hash = $1 AND t.purpose = 'password_reset'
           AND t.consumed_at IS NULL AND t.expires_at > $2
           AND c.email_verified_at IS NOT NULL
         FOR UPDATE OF t, c`,
        [tokenHash, now],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return false;
      }
      const userId = String(row.user_id);
      await client.query(
        "UPDATE local_auth_credentials SET password_hash = $2, updated_at = $3 WHERE user_id = $1",
        [userId, passwordHash, now],
      );
      await client.query(
        `UPDATE local_auth_tokens SET consumed_at = $2
         WHERE user_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL`,
        [userId, now],
      );
      // The session payload contains passport.user.claims.sub. Deleting those
      // rows invalidates OIDC and local sessions for this identity after reset.
      await client.query(
        "DELETE FROM sessions WHERE sess #>> '{passport,user,claims,sub}' = $1",
        [userId],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

function recipientFromRow(row: QueryResultRow): LocalAuthRecipient {
  return {
    email: String(row.email),
    firstName: row.first_name === null ? null : String(row.first_name),
    lastName: row.last_name === null ? null : String(row.last_name),
  };
}

export const localAuthRepository = new PostgresLocalAuthRepository();
