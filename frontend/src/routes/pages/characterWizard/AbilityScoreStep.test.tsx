import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import '../../../i18n'
import AbilityScoreStep from './AbilityScoreStep'
import { POINT_BUY_DEFAULT_SCORES, type AbilityMethod } from './abilityRules'
import type { AbilityScores } from '../../../api/characters'

function Wrapper({ initialMethod }: { initialMethod: AbilityMethod }) {
  const [state, setState] = useState<{ method: AbilityMethod; scores: AbilityScores | null }>({
    method: initialMethod,
    scores: initialMethod === 'point-buy' ? POINT_BUY_DEFAULT_SCORES : null,
  })
  return (
    <AbilityScoreStep
      method={state.method}
      scores={state.scores}
      onChange={(method, scores) => setState({ method, scores })}
    />
  )
}

describe('AbilityScoreStep', () => {
  it('point buy never lets total spend exceed 27', async () => {
    const user = userEvent.setup()
    render(<Wrapper initialMethod="point-buy" />)

    const plusStr = screen.getByRole('button', { name: 'Увеличить Сила' })
    const plusDex = screen.getByRole('button', { name: 'Увеличить Ловкость' })
    const plusCon = screen.getByRole('button', { name: 'Увеличить Телосложение' })
    const plusInt = screen.getByRole('button', { name: 'Увеличить Интеллект' })

    // 8 -> 15 costs 9 points; three abilities at 15 spends exactly the 27-point budget.
    for (const button of [plusStr, plusDex, plusCon]) {
      for (let i = 0; i < 7; i += 1) {
        await user.click(button)
      }
    }
    expect(await screen.findByText('Осталось очков: 0 из 27')).toBeInTheDocument()

    // Budget is fully spent — raising a fourth ability must be blocked.
    expect(plusInt).toBeDisabled()
  })

  it('point buy disables decreasing below the minimum score', () => {
    render(<Wrapper initialMethod="point-buy" />)
    expect(screen.getByRole('button', { name: 'Уменьшить Сила' })).toBeDisabled()
  })

  it('standard array does not allow assigning the same value twice', async () => {
    const user = userEvent.setup()
    render(<Wrapper initialMethod="standard-array" />)

    const strSelect = screen.getByLabelText('Сила') as HTMLSelectElement
    const dexSelect = screen.getByLabelText('Ловкость') as HTMLSelectElement

    await user.selectOptions(strSelect, '15')
    const dexOptions = Array.from(dexSelect.options).map((option) => option.value)
    expect(dexOptions).not.toContain('15')
  })

  it('roll method shows a reroll button and six assignable slots', () => {
    render(<Wrapper initialMethod="roll" />)
    expect(screen.getByRole('button', { name: 'Бросить кости заново' })).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(6)
  })

  it('manual entry clamps values to the 1-30 range', async () => {
    const user = userEvent.setup()
    render(<Wrapper initialMethod="manual" />)

    const strInput = screen.getByLabelText('Сила') as HTMLInputElement
    await user.clear(strInput)
    await user.type(strInput, '99')
    await user.tab()
    expect(strInput).toHaveValue(30)

    await user.clear(strInput)
    await user.type(strInput, '0')
    await user.tab()
    expect(strInput).toHaveValue(1)
  })
})
