import c from 'compact-encoding'
import { compile, opt } from 'compact-encoding-struct'

export const userInfo = compile({
  publicKey: c.buffer,
  name: c.string,
  description: opt(c.string),
  tags: opt(c.string)
})

export const syncResponse = compile({
  block: (c.uint),
  artist: opt(c.string),
  name: opt(c.string)
})
