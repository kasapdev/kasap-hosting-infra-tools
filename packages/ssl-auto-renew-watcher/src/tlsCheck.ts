import tls from "node:tls";

/**
 * Successful TLS certificate expiry check.
 */
export interface CertCheckSuccess {
  host: string;
  port: number;
  validTo: Date;
  daysRemaining: number;
  issuer?: string;
  error?: undefined;
}

/**
 * Failed TLS certificate expiry check (connection error, timeout, or
 * unparsable certificate).
 */
export interface CertCheckFailure {
  host: string;
  port: number;
  error: string;
}

export type CertCheckResult = CertCheckSuccess | CertCheckFailure;

/**
 * Shape of `tls.connect`, narrowed to what `checkCertExpiry` needs. Accepting
 * this as a parameter (defaulting to the real `tls.connect`) lets tests
 * inject a fake socket instead of opening a real network connection.
 */
export type TlsConnectFn = (
  options: tls.ConnectionOptions,
  callback?: () => void
) => tls.TLSSocket;

/**
 * Opens a TLS connection to `host:port`, reads the peer certificate, and
 * computes how many days remain before it expires.
 *
 * Never throws: connection errors, timeouts, and unparsable certificates are
 * all reported via the `{ error: string }` shape of the returned result.
 */
export function checkCertExpiry(
  host: string,
  port = 443,
  timeoutMs = 5000,
  connectFn: TlsConnectFn = tls.connect
): Promise<CertCheckResult> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: CertCheckResult): void => {
      if (settled) return;
      settled = true;
      try {
        socket.removeAllListeners();
        socket.destroy();
      } catch {
        // best-effort cleanup only
      }
      resolve(result);
    };

    const socket = connectFn(
      { host, port, servername: host, timeout: timeoutMs },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          if (!cert || !cert.valid_to) {
            finish({ host, port, error: "No certificate returned by peer" });
            return;
          }

          const validTo = new Date(cert.valid_to);
          if (Number.isNaN(validTo.getTime())) {
            finish({
              host,
              port,
              error: `Unable to parse certificate valid_to value: ${cert.valid_to}`,
            });
            return;
          }

          const daysRemaining = Math.ceil((validTo.getTime() - Date.now()) / 86_400_000);
          const issuerRaw = cert.issuer?.O ?? cert.issuer?.CN ?? undefined;
          const issuer = Array.isArray(issuerRaw) ? issuerRaw[0] : issuerRaw;

          finish({ host, port, validTo, daysRemaining, issuer });
        } catch (err) {
          finish({
            host,
            port,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    );

    socket.once("error", (err: Error) => {
      finish({ host, port, error: err.message });
    });

    socket.once("timeout", () => {
      finish({ host, port, error: `Connection to ${host}:${port} timed out after ${timeoutMs}ms` });
    });
  });
}

/**
 * User-defined type guard narrowing a `CertCheckResult` to its failure
 * variant. `result.error` is typed `string | undefined` across the union
 * (a plain `string`, not a literal type, on the failure side), so plain
 * truthiness/typeof narrowing on that property is not reliable — callers
 * should use this guard instead of `if (result.error)`.
 */
export function isCertCheckFailure(result: CertCheckResult): result is CertCheckFailure {
  return typeof result.error === "string";
}

export type ExpiryStatus = "ok" | "warning" | "expired";

/**
 * Pure classification of a certificate's remaining lifetime against a
 * warning threshold (in days).
 */
export function classifyExpiry(daysRemaining: number, warningDays: number): ExpiryStatus {
  if (daysRemaining <= 0) return "expired";
  if (daysRemaining <= warningDays) return "warning";
  return "ok";
}
