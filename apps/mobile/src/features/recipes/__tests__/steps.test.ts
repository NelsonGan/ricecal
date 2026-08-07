import { splitSteps } from '../RecipeSteps'

describe('splitSteps', () => {
  it('reads a return between steps as the break it is', () => {
    expect(splitSteps('Fry the rempah.\nAdd the beef.')).toEqual([
      'Fry the rempah.',
      'Add the beef.',
    ])
  })

  // The model writes a paragraph about a third of the time, and a cook reading
  // one has to find their place in it every time they look up from the pan.
  it('breaks a paragraph into its sentences', () => {
    expect(
      splitSteps('Fry the rempah until it darkens. Add the beef. Simmer for 3 hours.'),
    ).toEqual(['Fry the rempah until it darkens.', 'Add the beef.', 'Simmer for 3 hours.'])
  })

  // A full stop inside a measurement is not the end of anything.
  it('leaves a decimal alone', () => {
    expect(splitSteps('Pour in 1.5 litres of stock.')).toEqual(['Pour in 1.5 litres of stock.'])
  })

  it('leaves an abbreviation alone', () => {
    expect(splitSteps('Simmer for approx. 20 minutes.')).toEqual(['Simmer for approx. 20 minutes.'])
  })

  // Somebody who numbered their own steps would otherwise get those numbers
  // drawn beside the ones the list adds.
  it('takes off numbering the cook typed themselves', () => {
    expect(splitSteps('1. Boil the water\n2) Add the noodles\n- Drain\n• Serve')).toEqual([
      'Boil the water',
      'Add the noodles',
      'Drain',
      'Serve',
    ])
  })

  it('takes off a written-out step marker', () => {
    expect(splitSteps('Step 1: Brown the beef')).toEqual(['Brown the beef'])
  })

  it('drops blank lines rather than drawing empty numerals', () => {
    expect(splitSteps('Brown the beef.\n\n\nSimmer.\n')).toEqual(['Brown the beef.', 'Simmer.'])
  })

  it('has nothing to say about nothing', () => {
    expect(splitSteps('')).toEqual([])
    expect(splitSteps('   \n  ')).toEqual([])
  })
})
