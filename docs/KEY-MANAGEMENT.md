# Signing-key management

MomentSeal signed receipts use Ed25519 with PKCS#8 private keys, SPKI public keys, a domain-separated payload, and a SHA-256 key identifier derived from the public key.

For local development:

```bash
export MOMENTSEAL_KEY_PASSPHRASE='use-a-secret-manager-generated-value'
pnpm moment keygen --private-output private.pem --public-output public.pem
```

The CLI never accepts the passphrase as an argument because process arguments are commonly observable. Private-key files are written with mode `0600`. `--insecure-unencrypted` is only for disposable local keys.

## Production requirements

- Generate and store private keys in a managed KMS, HSM, or isolated signing service whenever possible.
- Keep verification keys in a separately administered trust store; never trust a public key embedded in the signed envelope.
- Separate development, staging, and production keys and signing identities.
- Restrict signing authorization, record every signing request, and rate-limit the signer.
- Rotate keys on a documented schedule and immediately after suspected exposure.
- Retain old public keys for the full receipt-verification period.
- Back up and test recovery of required verification keys; do not export non-exportable production private keys merely for backup convenience.

The bundled Node signer accepts PEM keys for portability. Integrations with cloud KMS or HSM services should implement signing outside the process while preserving the exact domain-separated canonical payload contract.
