export function createManifest (publicKey, namespace) {
  return {
    signer: {
      signature: 'ed25519',
      publicKey,
      namespace: Buffer.from(namespace.padEnd(32, '\0'))
    }
  }
}
