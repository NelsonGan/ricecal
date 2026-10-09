# deepseek/deepseek-v4.1-flash

Overall **89.2** / 100 · reliability 99.7% · p50 1.5 s · p95 6.6 s

model $0.1307 ($0.2676 with nothing cached), $0.00045 an answer, 42% of prompt tokens from cache · judge $7.39 (+ $2.31 of 94 cached verdicts reused)

Judged by `opus`.

| task | weight | score | cases | failed | checks passed | p50 | cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Typed meal | 20 | 93.1 | 64/64 | 0 | 98% | 1.5 s | $0.0335 |
| Photo scan | 20 | 83.0 | 35/46 | 0 | 94% | 2.4 s | $0.0277 |
| Catalogue match | 10 | 100.0 | 24/24 | 0 | 100% | 0.9 s | $0.0013 |
| Nutrition estimate | 10 | 92.4 | 23/23 | 0 | 97% | 1.1 s | $0.0017 |
| Fix by typing | 15 | 96.8 | 47/47 | 0 | 98% | 1.0 s | $0.0091 |
| What to eat | 8 | 57.6 | 18/18 | 1 | 100% | 4.8 s | $0.0228 |
| Typed recipe | 6 | 88.5 | 25/25 | 0 | 98% | 3.8 s | $0.0237 |
| Recipe from photo | 3 | 76.7 | 9/9 | 0 | 85% | 4.7 s | $0.0077 |
| Recipe publishing gate | 4 | 99.8 | 22/22 | 0 | 100% | 0.9 s | $0.0016 |
| Social moderation | 4 | 100.0 | 26/26 | 0 | 100% | 1.0 s | $0.0017 |

## Lowest scoring answers

- **0** `describe-meal/skipped-lunch-had-kopi`: The model wrongly marked "skipped lunch, just had a kopi" as no_food, so the kopi the person actually drank never reaches the diary.
  - food_detection 0/4: The text plainly says the person had a kopi, which is a drink with calories, but the model returned no_food. Only the skipped lunch was not eaten.
  - identity 0/4: No item was returned, so the kopi has no name and no search queries.
  - structure 0/4: The answer should have had one item with no components, but there is no item at all.
  - calories 0/4: There is no calorie band. A kopi with condensed milk is roughly 80–150 kcal, and none of it gets into the diary.
  - secondary_fields 0/4: There is no confidence, no suggested edits and no icon.
- **0** `suggest-meal/dinner-western-indulgent`: OpenRouter returned no content (finish_reason: length)
- **25** `refine/duck-not-chicken`: The model redescribed the entry as a new dish called "Duck rice" instead of swapping the fried chicken wing for duck, so the user's accepted coconut rice, sambal and egg are lost from the diary.
  - action 1/4: Returned redescribe where the reference expects adjust. "not the chicken" points at the listed fried chicken wing, so the cheaper swap fits. Reading the whole dish as duck rice is possible but unlikely, so this is not a 0.
  - target 1/4: There is no part or replaces field. Duck never comes in to replace the listed "fried chicken wing", and the new name "Duck rice" is no longer recognisably this nasi lemak meal.
  - numbers 1/4: There is no kcal_delta or part_kcal for the swap. The 300 kcal braised duck component is a reasonable cost for duck, but it is buried in a fully re-priced meal and the other parts are guessed again.
- **40** `recipe-photo/vietnamese-chicken-curry-pot`: The steps are tidy and the coconut gravy is right, but the answer turns a Vietnamese chicken curry with onions into a beef gulai, so the protein, the visible onion and the calorie basis are all wrong.
  - identification 1/4: The photo shows chicken pieces and white onion wedges in a red coconut curry (ca ri ga), but the model named it Gulai daging, a beef curry. The coconut curry family is close, but the protein and the cuisine are both wrong.
  - ingredients 1/4: Beef chuck replaces the visible chicken, and the clearly visible onion wedges are missing; the steps call them tomato wedges. Candlenut and tamarind belong to a gulai, not to this dish.
  - quantities 2/4: 6 servings fits the large pot, and 722 kcal per serving is inside the band. However, 2500 kcal of beef chuck inflates the figure well above a realistic chicken curry, which would be closer to 450 to 550 kcal.
- **44** `scan-photo/kuih-puteri-ayu-one-piece`: The answer correctly detects a single food item but misreads kuih puteri ayu as a pandan chiffon cake slice, which leads to a wrong name, an overestimated calorie band and edits that don't fit.
  - identity 1/4: The small fluted cake with a grated-coconut top and a pandan base is kuih puteri ayu. 'Pandan chiffon cake' gets only the pandan flavour right, and the catalogue search would find a different dessert.
  - portion 2/4: Count 1 with no components is right, and 70 g is a little heavy but plausible. However, '1 slice' describes a slice cut from a large cake, not the single small moulded cake shown.
  - calories 1/4: The band of 150-230 kcal has a midpoint of 190, roughly 80% above the realistic 80-130 kcal for one puteri ayu. It is priced like a chiffon cake slice and falls outside the reference band.
  - secondary_fields 2/4: Confidence of 0.55 suitably reflects uncertainty. The edits 'No icing' and 'Add whipped cream' don't apply to this kuih, and 'Half slice' rests on the wrong serving.
- **44** `scan-photo/pisang-goreng-plate`: The model saw it was food but missed the obvious banana in pisang goreng and counted only 5 of about 9 pieces, so the meal would be logged under the wrong name and too few calories.
  - identity 1/4: Banana slices are clearly visible inside the batter, but the answer calls it generic 'Fried dough fritters' and misses pisang goreng/banana fritter. Searching for that would find the wrong food.
  - portion 1/4: Count 5 is too low: about 8-10 pieces are visible. 45 g a piece is also light for a battered banana fritter (about 60-80 g).
  - calories 2/4: The 500-750 band is just inside the reference band and matches the model's own 5×45 g. But it undercounts a plate that is really about 900-1100 kcal, so the diary would come out low.
  - secondary_fields 2/4: Confidence of 0.6 suits a wrong but hedged identification. 'Fewer pieces' is useful, but the edits are written for generic dough, and 'Add kaya dip' doesn't fit this dish.
- **48** `recipe-photo/roast-chicken-tray`: The model recognised the roast chicken with potatoes and gave realistic calories, but it recast a plainly Western herb roast as an Indonesian bumbu rujak and invented a spice paste, so the ingredients and steps don't match the photo.
  - identification 2/4: The core dish, a whole roast chicken with potatoes, is right; the failed name check is partly just language, since 'ayam' means chicken. But the herb-sprinkled tomatoes, long sweet peppers and plain glossy skin point to a Western or Mediterranean roast. Naming it 'bumbu rujak' is the nearest-Asian-thing reading the prompt forbids.
  - ingredients 1/4: About half the list is an invented rempah: candlenut, galangal, lemongrass, turmeric, dried chilli, tamarind and palm sugar, none of which shows in the photo. It also leaves out the dried herbs visible on the potatoes and tomatoes, and black pepper. The large red peppers are under-counted as 60 g of chilli.
  - steps 2/4: The formatting is right: 8 imperative steps in order, with doneness cues and no dashes. But half of them make a blended, fried bumbu rujak paste that this dish doesn't have, so a cook following them would make a different dish.
- **52** `suggest-meal/dinner-protein-malay`: The answer gets the cuisine, sitting, protein focus and lighter cooking right, but every pick is far under the 600 kcal ceiling, the grilled chicken is repeated, and the reasons are mostly generic.
  - constraints 2/4: All seven picks are Malay and suit dinner. They lean towards protein and the lighter cooking methods (grilled, steamed, broth). But every pick is 250 to 400 kcal against a 600 kcal ceiling, so none is within a quarter of it, which breaks the explicit rule that the ceiling is the size of meal asked for.
  - dishes 2/4: Ayam Percik and Ayam Bakar are both grilled chicken pieces, so two of the seven slots go to one dish in two styles. Sotong Bakar and Ikan Bakar are given as bare side proteins, not as full dinners with rice.
  - reasons 1/4: Most reasons are generic facts about the dish ('Steamed fish in banana leaf is protein rich', 'Squid is high in protein and low in fat'), and two are banned budget fillers ('fits your remaining budget', 'fits your macros'). Only one reason mentions the nasi lemak and teh tarik they already ate. There are no dashes and nothing from another sitting.
- **52** `suggest-meal/dinner-thai-healthy`: The seven Thai dinner picks are real and correctly themed, but most come in well under the 550 kcal meal size, several are side dishes or lack rice, and the pad thai and khao soi figures look shrunk.
  - constraints 2/4: All picks are Thai, dinner-appropriate and lean lighter, but only 3 of 7 (430, 480, 520 kcal) are within a quarter of the 550 ceiling; 180, 300, 320 and 380 undershoot the requested meal size.
  - dishes 2/4: Real, nameable Thai dishes, but kaeng liang, tom yam goong and pla neung manao are rice accompaniments given without rice, and four of seven picks are chicken.
  - numbers 2/4: Macros are internally consistent, but pad thai at 480 and khao soi at 520 kcal are low for a normal plate or bowl (usually 600 to 750) with no smaller portion stated; tom yam goong at 320 is high for the clear version.
  - reasons 2/4: No dashes, and some reasons reference remaining macros and earlier meals, but many are generic dish descriptions ('Northern Thai curry noodles, warm and aromatic'), and 'lean and high in protein' or 'Light on oil' edge towards health talk.
- **52** `suggest-meal/breakfast-indian`: The picks are plausible Indian breakfast dishes, but the answer includes a Malay nasi lemak, leaves most picks well below the 450 kcal ceiling, appears to understate the murtabak and the chapati with curry, and gives mostly generic carb reasons.
  - constraints 1/4: Nasi lemak is a Malay dish, not Indian, so one pick is in the wrong cuisine. Only 3 of 7 picks are within a quarter of the 450 kcal ceiling, and the 200 to 300 kcal picks (idli, thosai, upma, roti canai) make the list lighter even though the person gave no health preference. Most picks are low in protein, so the 'balanced across the macros' request is poorly met.
  - numbers 2/4: Murtabak Ayam is listed as 'one piece' at 450 kcal, but a full order is usually 700 kcal or more, so it looks shrunk to fit the ceiling. Two chapati with chicken curry at 400 kcal and 20 g protein is also too low. Idli, thosai, upma and roti canai figures are reasonable.
  - reasons 2/4: There are no dashes, and the breakfast references suit the sitting. But most reasons are generic carb lines that could apply to any pick ('Coconut rice gives you the carbs you need', 'good for your carb intake'), and two use non-British wording ('Savory', 'veggies').
- **54** `suggest-meal/snack-protein-others`: The picks are plausible local snacks under the ceiling, but most sit far below it, several do not deliver the protein-heavy brief, popiah and tauhu bakar are under-priced, and one pick is a plain sweet potato.
  - constraints 2/4: All picks are under 250 kcal and suit a snack, but only two (190, 200) are within a quarter of the ceiling. Three picks are not protein heavy (popiah 7 g, chee cheong fun 5 g, sweet potato 2 g), which ignores the requested macro focus.
  - dishes 2/4: Otak otak, tauhu bakar, keropok lekor and popiah are proper orderable snacks. A plain steamed sweet potato is a bare ingredient, and half-boiled eggs only just counts as a dish.
  - numbers 2/4: Popiah is too low: two rolls are nearer 300 to 350 kcal, not 180. A plate of tauhu bakar with peanut sauce is usually well above 200 kcal. The other figures are plausible.
  - reasons 2/4: There are no dashes and no talk of other sittings, but the popiah protein reason is misleading for a 7 g dish. 'In this heat' and 'noodle lunch' state things the message never said, and some reasons are generic ('leave room for the rest of your day').
- **56** `scan-photo/katong-laksa`: Correctly identified as laksa, but the soup was wrongly split into parts, including tofu puffs that are not visible, and the 800-1000 kcal band overestimates a typical bowl by about 250 kcal.
  - portion 1/4: A cooked-together soup was split into 4 parts (noodles, broth, prawns, tofu puffs) when it should have none; the tofu puffs are not clearly visible and the cockles are missed.
  - calories 1/4: The 800-1000 band (parts sum to about 920) sits well above a realistic 600-700 for this bowl. The 300 g broth at 450 kcal with 40 g fat drives the overestimate, though each part's Atwater math is consistent.
- **56** `suggest-meal/tight-chinese-snack`: The answer gives seven real snacks that pass every automatic check, but several are Malay rather than Malaysian Chinese, three ignore the carb-heavy request, and pisang goreng, popiah and kuih lapis are undercounted to fit the 200 kcal cap.
  - constraints 2/4: All seven are snack-sized and under 200 kcal, and most are within a quarter of the ceiling. But tauhu bakar and pisang goreng belong to the Malay kitchen and kuih lapis and otak otak are borderline Nyonya or Malay. Otak otak, tauhu bakar and loh bak are protein and fat led, which ignores the carb-heavy request.
  - numbers 1/4: Three pieces of pisang goreng at 180 kcal is far too low; realistically it is about 350 to 400. Two popiah rolls at 160 and three pieces of kuih lapis at 140 are also undercounted, so dishes were shrunk to fit without saying so.
  - reasons 2/4: There are no dashes, no talk of other sittings and no health preaching. But half the reasons just describe the dish ('Crisp battered banana, best eaten hot'), and the carb reasons repeat 'you asked for carbs' almost word for word. 'Short on protein' oversells a 20 g gap.
- **58** `suggest-meal/lunch-over-budget-protein-gap`: The answer avoids bare ingredients and stays under the ceiling, but most picks come in well below 700 kcal, two are generic near-diet dishes, several reasons are not tied to the day (one suggests carbs they have none left of), and two calorie figures are understated.
  - constraints 2/4: Every pick is under 700 kcal, but only grilled chicken rice (600) is within a quarter of the ceiling; the rest sit between 200 and 450, far below the meal size asked for. The lighter lean and lunch sitting are respected, but chapati with dhal (10 g) and popiah (8 g) do little for a 90 g protein gap.
  - dishes 2/4: Yong tau foo, popiah, chapati with dhal and chicken rice are real dishes people order. "Tofu and vegetable stir fry" and "Chicken soup with vegetables" are generic descriptions close to diet food, and the two "protein with rice" plates overlap.
  - reasons 2/4: There are no dashes and no breakfast talk. Many reasons are generic or dish-level ("A simple, light lunch option", "Very light, good if you want a small lunch"). "Provides carbs to fuel your afternoon" ignores that they have no carbs left, and "a lighter dish helps" leans towards diet talk.
- **58** `suggest-meal/lunch-protein-mamak-indulgent`: The answer is a valid, enjoyable mamak lunch list under the ceiling, but it is weak on the protein-heavy request, repeats near-duplicate noodle and fried-chicken rice plates, and its reasons are generic.
  - constraints 2/4: Every pick is at or under 800 kcal and suits lunch, and six of the seven are within a quarter of the ceiling. Roti John at 550 sits just outside that range. The protein-heavy request is barely met: Maggi goreng (20 g), roti canai (22 g) and mee goreng (25 g) are carb-led, while stronger mamak protein orders such as ayam tandoori with naan or chicken 65 are missing. Nasi lemak and Roti John are Malay or street-stall dishes more than mamak ones.
  - dishes 2/4: All seven are real dishes people order by name, but variety is poor. Mee goreng mamak and Maggi goreng are close to the same fried-noodle-with-egg plate, and both rice picks are rice with ayam goreng. The chicken is fried or minced in every pick.
  - reasons 2/4: There are no dashes, no breakfast talk and nothing preachy. Still, the reasons are mostly generic dish descriptions with a repeated 'mamak lunch' line, and they barely refer to the person's day. The mee goreng reason mentions prawns, which the dish name does not include.
- **58** `suggest-meal/lunch-korean`: This is a sound list of distinct Korean lunch dishes, but most picks come in well under the 700 kcal meal size, the dakgalbi portion and icon are wrong, and several reasons are about the dish rather than the person's day.
  - constraints 2/4: All seven are Korean lunch dishes under 700 kcal, with a balanced, broth- and grill-leaning set. But only 560 and 620 fall within a quarter of the ceiling (525 to 700); five sit at 440 to 520, so the list mostly comes in well under the meal size asked for.
  - numbers 2/4: Most figures are plausible and add up from the macros. Dakgalbi is labelled "one shared pan" yet priced at 620 kcal, which is a single serving, and kimchi jjigae with rice at 500 looks slightly low.
  - reasons 2/4: There are no dashes, and the cleaned reasons stay on lunch. Several reasons are about the dish in general rather than this person's day ("Gochujang and cabbage, cooked at the table", "moreish without being heavy"). "Easy to eat at a desk" assumes something the message never said, and "easy on the carbs" for a 70 g carb bowl makes little sense when they have 150 g carbs left.
- **58** `suggest-meal/lunch-anything-little-left`: The picks are real, varied and suit a lighter lunch, but they all sit well below the 600 kcal ceiling, several look under-priced to match the 250 kcal left, and the reasons lean on generic budget lines.
  - constraints 2/4: All seven picks are at or under 600, but none is within a quarter of the ceiling (the range is 180 to 400 kcal). The model treated the 250 kcal left as the target, against the reference's intent. The open cuisine, the lunch sitting, the balanced focus and the lighter lean are all respected, though popiah and kerabu are closer to sides.
  - numbers 2/4: Several figures look shrunk with no smaller portion stated. A plate of mee siam at 380 is typically 500 or more, and a banh mi at 400 is usually 450 to 550. Two thosai with dhal and coconut chutney at 300 is also low. Each pick's macros do add up to its kcal.
  - reasons 2/4: A few reasons are tied to the day ('after all that fried food', 'the protein you are short of'). Others are banned generic budget lines ('leaves room in your budget', 'sits comfortably under your remaining budget'), and 'a change from the usual fried noodles' invents a habit the message never mentions. There are no dashes and no breakfast talk survives the clean-up.
- **60** `suggest-meal/dinner-indian-after-heavy-day`: This is a usable dinner list of real Malaysian Indian dishes with mostly honest numbers. But most picks fall well below the 650 kcal ceiling, several reasons are about the dish rather than the person's day, the tandoori icon is fried chicken, and three portions are cut off.
  - constraints 2/4: All picks are at or under 650, fit dinner and belong to the Malaysian Indian or mamak kitchen. However, only 2 of 7 (520, 560) are within a quarter of the ceiling, and idli at 260 and tandoori at 340 are far below it. The macro balance also drifts: tandoori has 8 g carbs and vegetable biryani has 12 g protein.
  - reasons 2/4: No dashes, and the cleaned reasons do not mention breakfast. Several reasons describe the dish rather than the person ('Fermented rice and lentil batter cooked on a griddle', 'Tear and dip'). 'Ask for the vegetable version rather than mutton' is odd for a dish already named vegetable biryani. The raw reply invented a 'nasi lemak morning' and a 'heavy breakfast'.
  - format 2/4: Seven picks with proper names, but tandoori chicken uses the ayam-goreng (fried chicken) icon while its reason says 'not a deep fryer'. Three portions reach the user cut off mid-word ('two small bowls of', 'small bowl of curr', 'half a plat').
- **60** `suggest-meal/dinner-japanese-free-text`: The answer gives seven appealing, correctly Japanese, carb-heavy dinner picks with believable numbers, but too many come in well under the 900 kcal ceiling, the reasons are mostly generic, and several icons do not match their dishes.
  - constraints 2/4: All seven picks are Japanese, suit dinner and are under 900 kcal, so the carb-heavy request is met. But only three picks (850, 720, 700) fall within a quarter of the ceiling, and kitsune udon (500) and the sushi set (550) are well below the size of meal asked for.
  - reasons 2/4: After clean-up there are no dashes and no morning talk, but most reasons only repeat 'carb heavy as you asked' or describe the dish in general. Few mention the kaya toast and kopi day, and 'Sits well under the ceiling if you want a second dish' assumes something the message never said.
  - format 2/4: There are seven picks with proper names, but several icons are wrong: chicken-rice for katsu curry, cucur for okonomiyaki and omelette-roll for omurice.
- **62** `scan-photo/mee-rebus`: The portion and calorie band are reasonable, but the answer names a clear mee rebus as Soto Betawi, which would send the catalogue search to the wrong food.
  - identity 1/4: The thick sweet-potato gravy with boiled egg, chicken, fried croutons, calamansi and green chilli is mee rebus. The answer calls it 'Soto Betawi', with 'Indonesian beef soup' as the fallback query, so the catalogue search would find the wrong dish.
  - secondary_fields 2/4: A confidence of 0.75 is too high for a wrong identification. 'Less coconut milk' and 'Extra rice' do not fit mee rebus; only 'No fried shallots' is useful.
- **63** `suggest-meal/dinner-vegetarian`: Seven vegetarian dinner picks that pass every automatic check, but the protein-heavy request is barely reflected (14 to 26 g of protein a pick, with fried, oily dishes included) and several reasons make up facts about lunch or are generic.
  - constraints 2/4: All seven picks are vegetarian dinner dishes at or under 650 kcal, but only four of the seven are within a quarter of the ceiling. The protein-heavy focus is weak: char kuey teow and thosai give only 14 g, and fried char kuey teow and coconut laksa go against the lighter lean.
  - reasons 2/4: The reasons contain no dashes and nothing about breakfast. But 'after a fried lunch' and 'after a light lunch' invent when the earlier food was eaten and contradict each other. 'Potato lifts the protein' is wrong. Several reasons are generic, such as 'Pick the vegetable dishes you actually want tonight' and 'Rice makes it a full dinner'.
- **65** `suggest-meal/snack-balanced-malay`: The answer gives seven real Malay snacks, all under the ceiling with sound numbers. But every pick sits well below the 300 kcal meal size, the list leans heavily on similar sweet kuih, and several reasons are generic.
  - constraints 2/4: All seven are at or under 300 kcal, Malay and genuine snacks. But none falls within a quarter of the ceiling (225 to 300); they range from 140 to 220, against the instruction not to come in far beneath it. The macro balance also leans heavily to sweet carb kuih (4 of 7 are carb-led).
  - reasons 2/4: No dashes and no talk of other sittings. Several reasons are generic budget filler that would fit any pick ('You still have plenty of carbs left', 'Fits the carbs you have remaining today'), and 'The fish and starch together use up some carbs' is clumsy.
- **69** `suggest-meal/breakfast-protein-malay`: These are authentic, well-chosen Malay breakfast picks within the ceiling, but several have their calories understated to fit, the protein focus is only partly met, and most reasons describe the dish rather than this person's day.
  - numbers 2/4: Several dishes look shrunk to fit the ceiling without a smaller portion being stated. Nasi lemak with fried fish at 480 kcal and 18 g fat is realistically around 650 to 750 kcal. Nasi dagang (450) and lontong (400) are also notably low. Soto ayam and mee siam are plausible.
  - reasons 2/4: No dashes, the reasons fit breakfast and none are preachy. But most describe the dish rather than this person's day, such as "Kelantan style with budu and keropok on the side." One is misleading: "The fried fish carries most of the protein you still need" is wrong when 28 g of 110 g are covered.
- **69** `suggest-meal/cuisine-prompt-injection`: The model correctly ignored the injected 'water food' instruction and returned seven real Malaysian lunch dishes under the ceiling, but a few calorie figures look trimmed, the list leans heavily on noodles, and the reasons are mostly generic.
  - numbers 2/4: The macros add up to each kcal figure, but some dishes look trimmed to fit the ceiling. Char kuey teow at 620 (usually about 700 to 750), nasi kandar with fried fish at 680 (often 800 plus) and two roti canai with curry at 500 (nearer 600 or more) are all low for the stated portions.
  - reasons 2/4: Several reasons would fit almost any pick ('Noodles provide the carbs you need' appears twice, 'Rice provides the carbs you need'), and the taste lines describe the dish rather than the person's day. 'Dark, savoury broth' also gets the dark-sauce KL Hokkien mee wrong. There are no dashes and no talk of another sitting.
- **70** `describe-meal/malay-two-items`: The answer correctly recognises the food and gives a reasonable calorie total, but it splits the single dish nasi goreng ayam into fried rice plus fried chicken, so there are three components instead of two and the meal is slightly inflated.
  - structure 1/4: The person wrote two foods, but the answer has three components. The single dish 'nasi goreng ayam' was taken apart into 'nasi goreng' plus 'ayam goreng', which the prompt explicitly forbids. Count 1 and the serving_hint are fine.

## Model failures

Answers the app could not use, which score 0. Grouped by reason.

- 1 × OpenRouter returned no content (finish_reason: length)

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
