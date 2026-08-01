const [target] = process.argv.slice(2);

if (!target) throw new Error("Usage: node scripts/wait-for-http.mjs <url>");

const url = new URL(target);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("Health target must be an HTTP(S) URL without credentials.");

for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(1_000) });
    if (response.ok) process.exit(0);
  } catch {
    // The bounded retry loop handles service startup and transient connection failures.
  }
  if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 1_000));
}

throw new Error(`Service did not become healthy within 30 attempts: ${url.origin}`);
