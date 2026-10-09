# claude:claude-haiku-5-5

Overall **92.2** / 100 · reliability 100.0% · p50 6.0 s · p95 12.1 s

model $0.0998 ($0.1371 with nothing cached), $0.00052 an answer · judge $9.62 (+ $0.05 of 2 cached verdicts reused)

Judged by `opus`.

| task | weight | score | cases | failed | checks passed | p50 | cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Typed meal | 20 | 95.5 | 64/64 | 0 | 100% | 6.8 s | $0.0374 |
| Photo scan | 20 | 81.0 | 35/46 | 0 | 92% | 10.5 s | $0.0368 |
| Catalogue match | 10 | 100.0 | 24/24 | 0 | 100% | 3.6 s | $0.0049 |
| Nutrition estimate | 10 | 90.3 | 23/23 | 0 | 90% | 5.0 s | $0.0078 |
| Fix by typing | 15 | 98.7 | 45/47 | 0 | 100% | 4.5 s | $0.0131 |

## Lowest scoring answers

- **31** `estimate-nutrition/fried-drumsticks-two`: I'd fail this answer: the macros are internally consistent but cover only one of the two drumsticks, so the diary would get about half the true calories, protein and fat.
  - calories 0/4: Two 90 g fried drumsticks (180 g at 2.5-3 kcal/g) come to about 450-540 kcal. The answer of 245 kcal is about half that, so it was likely priced as one drumstick.
  - macros 1/4: For a fried drumstick, 20 g protein, 15 g fat and 7 g carbs are in sensible proportions. But each figure is about half of what two drumsticks contain (expected roughly 40-50 g protein and 25-35 g fat).
- **39** `estimate-nutrition/pisang-goreng-three`: The model ignored the '3 ×' count and priced a single pisang goreng, so the diary records less than half the true calories and carbs, even though the numbers add up and are believable for one piece.
  - calories 1/4: 170 kcal is a reasonable figure for one pisang goreng, but the user logged 3 pieces. About 360–420 kcal was expected, so the diary gets less than half of what was eaten (the reference band is 270–450).
  - macros 1/4: The split looks right for a fritter, with carbs about 59% and fat about 37% of energy. But the gram amounts only cover one piece: 25 g carbs falls short of the 45–75 g reference for three.
- **44** `scan-photo/kl-hokkien-mee`: The answer correctly sees food but misreads KL Hokkien mee as char kway teow, breaks a stir-fried noodle dish into components, and lowballs the portion of a large plate.
  - identity 1/4: The noodles are thick, round yellow noodles braised dark, which makes this KL Hokkien mee. The answer calls them flat rice noodles and searches 'char kway teow', a different dish the catalogue would price wrongly.
  - portion 1/4: Fried noodles are cooked together and should have no components, but the answer splits them into noodles, prawns and pork. At 250 g of noodles and about 480 g in total, the parts undercount a large sharing-size plate.
  - calories 2/4: Components add to about 658 kcal, which sits inside the 550-700 band, and the macros fit the Atwater check. A large plate of KL Hokkien mee is more like 750-1000 kcal, so the midpoint is low.
  - secondary_fields 2/4: The edits (less oil, extra chilli, no prawns) are short and plausible. A confidence of 0.8 is too high for a misidentified dish.
- **44** `scan-photo/mee-rebus`: The answer gets this mee rebus wrong, calling it curry chicken with bread, and leaves the noodles and gravy out of the components, so the calories come in low even though the band falls inside the reference range.
  - identity 1/4: The dish is mee rebus: thick brown gravy with fried shallots, green chilli, calamansi, croutons, egg and chicken. The answer calls it 'Hainanese curry chicken with bread', which misses the noodle dish entirely, so the catalogue search will find the wrong food.
  - portion 1/4: The components leave out the noodles and the gravy, which make up most of the bowl. Only the toppings are priced (3 bread pieces, a drumstick and an egg), which is exactly the 'listing what is on top' mistake the prompt warns against.
  - calories 2/4: The components add up to 565 kcal, which sits inside the 520-620 band, and the per-component macros pass the Atwater check. Without the noodles and gravy, though, the band under-counts a bowl of mee rebus with chicken and egg, which is realistically around 650-800 kcal.
  - secondary_fields 2/4: A confidence of 0.8 is too high for a wrong identification. The suggested edits are short and usable but fit curry bread, not this dish.
- **62** `scan-photo/es-cendol-glass`: The model got the food detection and portion right, but it misnamed an obvious es cendol with durian as a pandan milk drink, and its calorie band is too low for coconut milk, gula melaka and durian.
  - identity 1/4: The green rice-flour strands in coconut milk are classic es cendol, but the model called it 'es susu pandan' with 'green jelly' and never says cendol. It also misses the durian topping and puts a parenthesised alias in the name, so a catalogue search would likely find the wrong drink.
  - calories 2/4: The 180–320 band has a midpoint of 250, which sits at the low end of the reference's 250–400 kcal. Because the drink was misread as a plain sweet milk drink, the band leaves out the coconut milk, gula melaka and durian, which would put a careful estimate around 300–400 kcal.
  - secondary_fields 2/4: A confidence of 0.5 is reasonable given the misidentification. Of the edits, 'Less sugar' and 'Half sweetness' say nearly the same thing and 'Extra ice' changes almost nothing. Useful cendol edits like 'No durian' or 'Less gula melaka' are missing.
- **64** `scan-photo/roti-canai-teh-tarik`: The dish is correctly identified, but the model logged a whole four-person table as one meal, so about 2,500 kcal would go into a single diary.
  - portion 1/4: The photo shows four people's sets: four plates, four dhal bowls and four mugs. The model logged all of them as one person's meal with each component at count 4. It should have split the meals or logged one person's share, so the diary gets four times the food.
  - calories 1/4: The parts are each plausible and add up correctly (about 2,480 kcal, and the Atwater check holds). But the 2300–2700 band is far above the reference's roughly 450–1,100 for one person's meal, so the diary would be badly overstated.
- **65** `scan-photo/katong-laksa`: The dish is correctly identified as curry laksa, but the answer breaks the soup into noodles and prawns and leaves out the coconut broth, so it comes in at about 380 kcal against roughly 600 for the real bowl.
  - portion 1/4: A laksa is one cooked-together soup and should have no components, but the answer splits out noodles and prawns. The breakdown also leaves out the coconut broth, the main part of the bowl, so the app would price an incomplete meal.
  - calories 1/4: The 340-420 kcal band (midpoint 380) is well below a realistic 550-750 for a bowl of laksa because the santan broth (~250-350 kcal) is missing. The noodle and prawn figures are plausible on their own, and the noodle macros add up correctly.
- **71** `scan-photo/tonkotsu-ramen`: The dish is correctly identified as tonkotsu ramen, but splitting the soup into noodles and chashu leaves out the broth, so the bowl is underpriced at about 430 kcal and the band is too low.
  - portion 1/4: Ramen is a soup, so the reference expects no components. The model split it into noodles and chashu and left out the tonkotsu broth entirely, so the app would price only part of the bowl. The 600 g bowl weight and the '1 bowl' hint are reasonable.
  - calories 2/4: The component macros roughly add up (noodles about 319 vs 350 kcal, chashu about 80), but the parts total only 430 kcal because the fatty broth is missing. The 380–560 band (midpoint 470) is low for a full tonkotsu bowl, which is realistically about 600–800 kcal.
- **73** `scan-photo/yong-tau-foo-dry-noodles`: The model correctly identifies a yong tau foo meal with dry noodles, but it counts too many stuffed tofu pieces, so the roughly 800 kcal estimate is a bit high, though still inside the reference band.
  - portion 2/4: The bowl shows about four pieces: one white stuffed tofu or fish cake, one fish ball and two fried tofu puffs. The model lists 3 stuffed tofu, so it counts about 2 pieces that aren't there. The noodle and pork weights and the 500 g total are plausible.
- **73** `scan-photo/chicken-fried-rice-with-sides`: The model correctly identified the chicken fried rice and gave a sensible calorie band, but it left out the visible dipping sauce and greens even though its own name says \"with sides\".
  - portion 2/4: 380 g and "1 plate" fit the rice. But the separate dipping sauce in its own dish and the side of greens are visibly separate, and the prompt says to list them. Components were left empty, so the sides drop out of the breakdown.

## Not graded

- `scan-photo/bench-chicken-rice-late` skipped: photo-bench/01-chickenrice-late.jpg is not on this machine
- `scan-photo/bench-nasi-lemak-pork-chop` skipped: photo-bench/02-nasilemak-porkchop.jpg is not on this machine
- `scan-photo/bench-pork-belly-omelette` skipped: photo-bench/03-porkbelly.jpg is not on this machine
- `scan-photo/bench-chicken-rice-early` skipped: photo-bench/04-chickenrice-early.jpg is not on this machine
- `scan-photo/bench-boxed-nasi-lemak` skipped: photo-bench/05-nasilemak-friedchicken.jpg is not on this machine
- `scan-photo/bench-karaage-set` skipped: photo-bench/06-korean-friedchicken.jpg is not on this machine
- `scan-photo/bench-prawn-pasta` skipped: photo-bench/07-prawn-pasta.jpg is not on this machine
- `scan-photo/bench-omelette-rice-curry` skipped: photo-bench/08-omelette-rice-curry.jpg is not on this machine
- `scan-photo/bench-fried-beehoon-plate` skipped: photo-bench/09-nasikandar.jpg is not on this machine
- `scan-photo/bench-karaage-cream-sauce` skipped: photo-bench/10-friedchicken-cream-set.jpg is not on this machine
- `scan-photo/bench-claypot-beef` skipped: photo-bench/12-claypot-beef.jpg is not on this machine
- `refine/shared-with-wife` judge_failed: claude -p failed: You've hit your weekly limit · resets Oct 12 at 8am (Asia/Kuala_Lumpur)
- `refine/half-the-wings` judge_failed: claude -p failed: You've hit your weekly limit · resets Oct 12 at 8am (Asia/Kuala_Lumpur)
