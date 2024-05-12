import * as core from '@actions/core'
import { cleanup } from './cleanup-impl'

async function main() {
  await cleanup()
}

main().catch(err => core.setFailed(err.message))
