import { readFileSync, appendFileSync } from 'node:fs'

const summaryPath = process.env.GITHUB_STEP_SUMMARY

function buildSummary() {
  let total
  try {
    ;({ total } = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8')))
  } catch {
    return '## Frontend coverage\n\nNo coverage report was produced (test run likely failed before it could write one).\n'
  }

  const pct = (metric) => `${total[metric].pct}% (${total[metric].covered}/${total[metric].total})`

  return [
    '## Frontend coverage',
    '',
    '| Metric | Coverage |',
    '| --- | --- |',
    `| Statements | ${pct('statements')} |`,
    `| Branches | ${pct('branches')} |`,
    `| Functions | ${pct('functions')} |`,
    `| Lines | ${pct('lines')} |`,
    '',
  ].join('\n')
}

const summary = buildSummary()

if (summaryPath) {
  appendFileSync(summaryPath, summary)
} else {
  console.log(summary)
}
