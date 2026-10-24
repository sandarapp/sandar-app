import { describe, expect, it } from 'vitest';
import { connection } from '../packages/database/src/database.js';

const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';
const url = 'postgresql://user:pw@db.example.invalid:5432/postgres?sslmode=require&application_name=sandar';

describe('database connection settings', () => {
  it('leaves the URL as it is without a CA certificate', () => {
    expect(connection(url, undefined)).toEqual({ connectionString: url });
  });

  it('verifies the server against the given CA and drops SSL settings from the URL', () => {
    const options = connection(url, pem);
    expect(options.ssl).toEqual({ ca: pem, rejectUnauthorized: true });
    expect(new URL(options.connectionString).searchParams.has('sslmode')).toBe(false);
    expect(new URL(options.connectionString).searchParams.get('application_name')).toBe('sandar');
  });

  it('accepts a certificate pasted with escaped line breaks', () => {
    expect(connection(url, pem.replace(/\n/g, '\\n')).ssl?.ca).toBe(pem);
  });

  it('refuses something that is not a certificate', () => {
    expect(() => connection(url, 'not a cert')).toThrow('DATABASE_CA_CERT');
  });
});
