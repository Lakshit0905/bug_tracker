import { describe, expect, it } from 'vitest'
import { emptyBug, validate } from '../components/bugs/BugForm'

const valid = {
  ...emptyBug(),
  title: 'Login button broken',
  description: 'Nothing happens on click',
  severity: 'HIGH' as const,
  category: 'UI' as const,
  steps_to_reproduce: '1. Click',
  expected_result: 'Logs in',
  actual_result: 'Nothing',
}

/** These limits mirror the API (backend/app/schemas/bug.py); the boundaries are tested on both sides. */
describe('bug form validation', () => {
  it('accepts a complete bug', () => expect(validate(valid)).toEqual({}))

  it('flags every required field on an empty form', () => {
    expect(Object.keys(validate(emptyBug())).sort()).toEqual(
      ['actual_result', 'category', 'description', 'expected_result', 'severity', 'steps_to_reproduce', 'title'].sort(),
    )
  })

  it.each([
    ['abcd', true],
    ['abcde', false],
    ['   abcd   ', true], // whitespace is trimmed like the server does
    ['x'.repeat(200), false],
    ['x'.repeat(201), true],
  ])('title %j → error %s', (title, hasError) => expect('title' in validate({ ...valid, title })).toBe(hasError))

  it.each([
    ['x'.repeat(9), true],
    ['x'.repeat(10), false],
  ])('description length boundary %#', (description, hasError) => expect('description' in validate({ ...valid, description })).toBe(hasError))

  it.each([
    ['x'.repeat(255), false],
    ['x'.repeat(256), true],
  ])('environment length boundary %#', (environment, hasError) => expect('environment' in validate({ ...valid, environment })).toBe(hasError))

  it.each([
    ['x'.repeat(5000), false],
    ['x'.repeat(5001), true],
    ['   ', true],
  ])('steps length boundary %#', (steps, hasError) =>
    expect('steps_to_reproduce' in validate({ ...valid, steps_to_reproduce: steps })).toBe(hasError))
})
