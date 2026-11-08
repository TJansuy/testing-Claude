// The TLS certificate. Uses CERT_DIR/key.pem + cert.pem; if they don't exist yet,
// creates a self-signed certificate and saves it there, so devices only have to
// accept it once.
import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';
import { ADVERTISED_HOST, CERT_DIR } from './config';

export function loadTls(): { key: string | Buffer; cert: string | Buffer } {
  const keyFile = path.join(CERT_DIR, 'key.pem');
  const certFile = path.join(CERT_DIR, 'cert.pem');
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  }

  const altNames: Array<{ type: number; value?: string; ip?: string }> = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }];
  if (ADVERTISED_HOST) {
    const isIp = /^[\d.]+$/.test(ADVERTISED_HOST) || ADVERTISED_HOST.includes(':');
    altNames.push(isIp ? { type: 7, ip: ADVERTISED_HOST.replace(/^\[|\]$/g, '') } : { type: 2, value: ADVERTISED_HOST });
  }
  const pems = selfsigned.generate([{ name: 'commonName', value: ADVERTISED_HOST || 'LocalChatter relay' }], {
    days: 825,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  });
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(keyFile, pems.private, { mode: 0o600 });
  fs.writeFileSync(certFile, pems.cert);
  console.log(`Created self-signed certificate in ${CERT_DIR} (fingerprint ${pems.fingerprint})`);
  return { key: pems.private, cert: pems.cert };
}
