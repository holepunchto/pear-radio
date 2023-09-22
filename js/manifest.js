import Hypercore from 'hypercore'
import ram from 'random-access-memory'

export function createManifest (publicKey, namespace) {
  return {
    signer: {
      signature: 'ed25519',
      publicKey,
      namespace: Buffer.from(namespace.padEnd(32, '\0'))
    }
  }
}

export async function tweak (publicKey, namespace) {
  const core = new Hypercore(ram, { keyPair: { publicKey }, manifest: createManifest(publicKey, namespace) })
  await core.ready()
  const tweakedPublicKey = core.key
  await core.close()
  return tweakedPublicKey
}
