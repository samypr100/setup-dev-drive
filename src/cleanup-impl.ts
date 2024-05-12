import * as core from '@actions/core'
import { exec, ExecOptions } from '@actions/exec'
import { POWERSHELL_BIN, StateVariables, WIN_PLATFORM } from './constants'
import { quote } from 'shell-quote'

export async function cleanup(): Promise<void> {
  if (process.platform !== WIN_PLATFORM) {
    throw new Error('This action can only run on windows.')
  }

  core.info('Attempting to remove Dev Drive...')

  const drivePath = core.getState(StateVariables.DevDrivePath)
  core.debug(`Retrieved State ${StateVariables.DevDrivePath}=${drivePath}`)

  const pathArg = quote([drivePath])
  const pwshCommand = `Dismount-VHD -Path ${pathArg}`
  const pwshCommandArgs = ['-NoProfile', '-Command', `. {${pwshCommand}}`]

  const options: ExecOptions = {}
  options.failOnStdErr = false
  options.ignoreReturnCode = true

  const ret = await exec(POWERSHELL_BIN, pwshCommandArgs, options)

  core.info(`Removal completed with exit code ${ret}...`)
}
