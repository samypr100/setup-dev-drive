import * as core from '@actions/core'
import Handlebars from 'handlebars'
import { EnvVariables } from './constants'

const envVarPattern = /^[a-zA-Z_]+[a-zA-Z0-9_]*$/
const envPossibleValues = Object.values(EnvVariables)
const envAllowedValuesPattern = new RegExp(
  `^{{\\s*(${envPossibleValues.join('|')})\\s*}}`,
)

/**
 * Like .split, but keeps the rest of the data when a limit is given.
 */
function splitKeep(input: string, separator: string, limit: number): string[] {
  if (limit === 0) {
    return []
  }
  const parts = input.split(separator)
  if (parts.length > limit) {
    return [...parts.slice(0, limit - 1), parts.slice(limit - 1).join(separator)]
  }
  return parts.concat(Array<string>(limit - parts.length).fill(''))
}

export async function processEnvMapping(
  envMapping: string[],
  ...varsToMap: EnvVariables[]
) {
  envMapping.forEach((entry, index) => {
    const entryNumber = index + 1
    const [rawEnvVar, rawTemplate] = splitKeep(entry, ',', 2)

    // core.getMultilineInput trims the input, hence we only trim the split edges
    const [envVar, template] = [rawEnvVar.trimEnd(), rawTemplate.trimStart()]

    if (!envVar || !template) {
      core.warning(`Invalid env mapping at entry ${entryNumber}, is it missing ','?`)
      return
    }

    if (!envVarPattern.test(envVar)) {
      core.warning(
        `Invalid environment variable \`${rawEnvVar}\` at entry ${entryNumber}, expected it to follow the pattern \`${envVarPattern.source}\`.`,
      )
      return
    }

    if (!envAllowedValuesPattern.test(template)) {
      core.warning(
        `Invalid template \`${rawTemplate}\` at entry ${entryNumber}, expected it to start with \`{{ ${envPossibleValues.join(' or ')} }}\`.`,
      )
      return
    }

    const templateFunction = Handlebars.compile(template, {
      data: false,
      noEscape: true,
      knownHelpersOnly: true,
      preventIndent: true,
      ignoreStandalone: true,
      strict: true,
    })

    // Dynamically create the context from specific members
    const context = varsToMap.reduce(
      (acc, key) => {
        if (key in process.env) {
          acc[key] = process.env[key]!
        } else {
          core.debug(
            `Skipping processing \`${key}\` as it was not found in the environment.`,
          )
        }
        return acc
      },
      {} as Record<string, string>,
    )

    let result
    try {
      result = templateFunction(context)
    } catch (_) {
      core.warning(
        `Unable to render dynamic value at entry ${entryNumber} for \`${rawTemplate}\`. Was an option missing?`,
      )
      return
    }

    // Expose the result to the job using the new env variable
    core.exportVariable(envVar, result)
    core.debug(
      `Exported new dynamic environment variable from entry ${entryNumber}: \`${envVar}=${result}\`.`,
    )
  })
}
