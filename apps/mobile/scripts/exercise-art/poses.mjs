/**
 * What each exercise's drawing shows, for `generate.mjs`.
 *
 * One line per catalogue id, written as a coach would describe the frame that
 * makes the movement unmistakable: body position, grip, the phase of the rep,
 * and the equipment in it. A generic "person lifting" brief draws a generic
 * person lifting, which is the one thing this set must never be, because the
 * picture is how somebody tells a seated cable row from a machine row.
 *
 * Not shipped: the app never reads this file.
 */
export const POSES = {
  // Chest
  'barbell-bench-press':
    'lying flat on its back on a flat weight bench, feet planted on the floor, both hands gripping an olympic barbell slightly wider than shoulder width, arms fully extended pressing the bar up above the chest; round plates on both ends of the bar. Side view.',
  'incline-bench-press':
    'lying on a bench inclined at about 30-45 degrees, feet on the floor, pressing an olympic barbell straight up above the upper chest with arms extended; plates on both ends. Side view so the incline angle is obvious.',
  'decline-bench-press':
    'lying on a decline bench with the head lower than the hips, legs hooked under the foot pads at the high end, pressing an olympic barbell up above the lower chest with arms extended. Side view so the decline angle is obvious.',
  'dumbbell-bench-press':
    'lying flat on its back on a flat bench, feet on the floor, pressing a pair of hexagonal dumbbells straight up above the chest, one in each hand, arms extended, dumbbells nearly touching at the top. 3/4 side view.',
  'incline-dumbbell-press':
    'lying on a bench inclined about 30-45 degrees, pressing a pair of dumbbells straight up above the upper chest with arms extended. Side view so the incline is obvious.',
  'smith-bench-press':
    'lying on a flat bench inside a Smith machine, pressing the Smith machine bar (a barbell fixed to two vertical steel guide rails) up above the chest; the two vertical rails are clearly visible on both sides. 3/4 view.',
  'machine-chest-press':
    'seated upright on a chest press machine with back against the pad, pushing two horizontal handles forward at chest height with arms nearly extended; a weight stack is visible behind. Side view.',
  'dumbbell-fly':
    'lying FLAT on its back on a FLAT, LEVEL weight bench (no incline at all, the bench is parallel to the floor), feet planted on the floor, both arms opened wide out to the sides at chest height with a slight bend at the elbows, a dumbbell in each hand, at the stretched bottom of a chest fly. Side-3/4 view in which the torso is clearly horizontal.',
  'incline-dumbbell-fly':
    'lying on an incline bench (about 30 degrees), arms opened wide to the sides with slightly bent elbows holding a dumbbell in each hand, in the stretched position of a fly. 3/4 view showing the incline and the wide arms.',
  'pec-deck':
    'seated upright on a pec deck machine, forearms and hands on two padded handles that swing in an arc, bringing them together in front of the chest; tall frame with weight stack. Front-3/4 view.',
  'cable-crossover':
    'standing between two tall cable towers, one foot forward, leaning slightly forward, pulling two cable handles from high pulleys down and together in front of the lower chest, hands meeting in front of the body. Front-3/4 view showing both cables.',
  'low-cable-fly':
    'standing between two cable towers with the pulleys set low near the floor, sweeping two cable handles upward and together to meet in front of the upper chest at shoulder height, arms slightly bent. Front-3/4 view.',
  'dumbbell-pullover':
    'lying FACE UP across a flat bench: only the upper back rests on the bench, hips lowered below it, feet flat on the floor, belly facing the ceiling; both hands hold ONE dumbbell together, arms almost straight, reaching back behind and above the head in the stretched position of a pullover. Side view where the face-up position is unmistakable.',
  'push-up':
    'in a standard push-up: body in a straight plank line from head to heels, hands on the floor under the shoulders, arms bent lowering the chest close to the floor. Side view.',
  'knee-push-up':
    'in a knee push-up: knees on the floor with lower legs raised, hands under the shoulders, body straight from knees to head, arms bent lowering the chest. Side view.',
  'incline-push-up':
    'doing an incline push-up with both hands on a flat bench and feet on the floor behind, body straight and angled upward, arms bent lowering the chest toward the bench edge. Side view.',
  'decline-push-up':
    'doing a decline push-up with both feet up on a flat bench behind and hands on the floor, body straight and angled downward toward the head, arms bent. Side view.',
  'chest-dip':
    'on parallel dip bars, supported on both hands, torso leaning clearly forward, knees bent and crossed behind, elbows bent lowering the body between the bars. Side view.',

  // Back
  deadlift:
    'standing at the top of a conventional deadlift: standing tall with hips and knees locked out, holding a loaded olympic barbell with straight arms in front of the thighs, overhand grip, plates on both ends. Side view.',
  'sumo-deadlift':
    'in a sumo deadlift: very wide stance with toes turned out, hands gripping a loaded barbell inside the knees, back flat, lifting the bar just off the floor with knees pushed out. Front-3/4 view showing the wide stance.',
  'trap-bar-deadlift':
    'standing inside a hexagonal trap bar (hex bar) loaded with plates, gripping the two side handles with arms straight at the sides, standing up tall at the top of the lift. 3/4 view so the hexagon shape is visible.',
  'rack-pull':
    'in a power rack, a loaded barbell resting on the safety pins at knee height, the figure gripping the bar and pulling it up to lockout, standing tall with the bar at the thighs. 3/4 view showing the rack uprights and pins.',
  'barbell-row':
    'in a bent-over barbell row: knees slightly bent, torso hinged forward nearly parallel to the floor with a flat back, pulling a loaded barbell up to the lower ribs with elbows driving back. Side view.',
  'dumbbell-row':
    'doing a single-arm dumbbell row: one knee and the same-side hand braced on a flat bench, back flat and horizontal, the other hand pulling a dumbbell up to the hip with the elbow high. Side view.',
  'chest-supported-row':
    'lying face down on an incline bench (chest on the pad), both arms hanging and pulling a pair of dumbbells up beside the ribs with elbows bent back. Side view.',
  't-bar-row':
    'straddling a barbell anchored at one end in a landmine on the floor, plates loaded on the free end, torso bent forward with flat back, pulling a V-handle under the plates up toward the chest. Side view.',
  'seated-cable-row':
    'sitting on a low cable row bench with feet on the foot platform and knees slightly bent, torso upright, pulling a V-grip cable handle into the stomach with elbows back; the cable runs horizontally to a low pulley. Side view.',
  'machine-row':
    'seated at a plate-loaded or selectorized row machine, chest against a vertical pad, pulling two handles back toward the torso with elbows bent and squeezed back. Side view.',
  'lat-pulldown':
    'seated at a lat pulldown machine, thighs locked under the knee pad, torso upright leaning back slightly, both hands gripping a wide straight bar attached by a cable to the top pulley, pulling the bar down to the upper chest. 3/4 rear view.',
  'close-grip-pulldown':
    'seated at a lat pulldown machine with thighs under the knee pad, pulling a close-grip V-handle (two parallel handles close together) down to the upper chest, elbows down by the ribs. Side view.',
  'straight-arm-pulldown':
    'standing facing a tall cable tower, hips hinged slightly, arms kept straight, pushing a straight bar from the high pulley down in an arc to the thighs. Side view.',
  'pull-up':
    'hanging from a horizontal pull-up bar with an overhand grip wider than the shoulders, palms facing away, pulling the body up so the chin is above the bar, legs straight below. Front-3/4 view.',
  'chin-up':
    'on a pull-up bar with an underhand shoulder-width grip (palms facing the body), pulled up so the chin is over the bar, elbows in front. Front-3/4 view with the palms visibly facing the figure.',
  'assisted-pull-up':
    'on an assisted pull-up machine: kneeling on a padded platform that pushes up, gripping the high handles and pulling the body up with chin near the handles; tall machine frame with weight stack. Side view.',
  'inverted-row':
    'lying underneath a barbell set in a rack at hip height, heels on the floor, body straight like a reverse plank, hands gripping the bar, pulling the chest up to the bar. Side view.',
  'back-extension':
    'on a 45-degree hyperextension bench: hips on the pad, ankles hooked under the foot rollers, arms crossed over the chest, torso raised in line with the legs at the top of the movement. Side view.',
  'good-morning':
    'with a barbell resting across the upper back behind the neck, knees slightly bent, hinging forward at the hips with a flat back until the torso is nearly parallel to the floor. Side view.',
  'barbell-shrug':
    'standing upright holding a loaded barbell in front of the thighs with straight arms, shoulders shrugged up toward the ears. Front view.',
  'dumbbell-shrug':
    'standing upright with a heavy dumbbell hanging in each hand at the sides, arms straight, shoulders shrugged up toward the ears. Front view.',
  superman:
    'lying face down on a mat, arms extended straight in front and legs straight behind, lifting arms, chest and legs off the floor at the same time like Superman flying. Side view.',
  'band-pull-apart':
    'standing upright facing the viewer, holding a bright green flat elastic resistance band (a thin, flexible, clearly stretchy strip, not a bar) in both hands at chest height, arms straight and pulled wide apart so the band is stretched taut across the front of the chest. Front view.',

  // Shoulders
  'overhead-press':
    'standing upright, pressing a loaded olympic barbell straight overhead with arms locked out, the bar above the crown of the head, feet hip width. Side view.',
  'dumbbell-shoulder-press':
    'seated on an upright bench with back support, pressing a pair of dumbbells overhead, arms nearly extended, dumbbells above the shoulders. Front-3/4 view.',
  'arnold-press':
    'seated on an upright bench mid-way through an Arnold press: dumbbells at face height with palms facing the body and elbows in front, rotating as they press up. Front view.',
  'machine-shoulder-press':
    'seated at a shoulder press machine with back against the upright pad, pushing two handles overhead from shoulder height; weight stack behind. Side view.',
  'lateral-raise':
    'standing upright raising a dumbbell in each hand out to the sides to shoulder height, arms almost straight forming a T. Front view.',
  'cable-lateral-raise':
    'standing side-on to a cable tower, raising a single cable handle from a low pulley across and out to the side to shoulder height with one straight arm; the cable runs across the body. Front view.',
  'front-raise':
    'standing upright raising a dumbbell in each hand straight forward to shoulder height with straight arms, palms facing down. Side view.',
  'rear-delt-fly':
    'bent over at the hips with a flat back, raising a dumbbell in each hand out to the sides with slightly bent arms, squeezing the shoulder blades. Front-3/4 view.',
  'reverse-pec-deck':
    'seated facing INTO a pec deck machine (chest against the back pad), arms straight out to the sides, pulling the handles back in a reverse fly. 3/4 rear view.',
  'face-pull':
    'standing facing a cable tower, pulling a rope attachment from a high pulley toward the face, elbows high and flared out, hands either side of the head. Side view.',
  'upright-row':
    'standing upright pulling a barbell (narrow grip) straight up along the body to chest height, elbows high above the hands. Front view.',
  'landmine-press':
    'standing, pressing the loaded free end of a barbell anchored in a floor landmine up and forward at an angle with one arm. Side view.',
  'pike-push-up':
    'in a pike push-up: hips raised high so the body forms an upside-down V, hands and feet on the floor, bending the elbows to lower the head toward the floor. Side view.',
  'handstand-push-up':
    'upside down in a handstand against a wall, hands on the floor, heels resting on the wall, arms bent lowering the head toward the floor. Side view.',

  // Arms
  'barbell-curl':
    'standing upright curling a straight barbell with an underhand shoulder-width grip, elbows tucked at the sides, the bar raised to chest height. Side view.',
  'dumbbell-curl':
    'standing upright curling a pair of dumbbells with palms facing up, elbows at the sides, one dumbbell raised to the shoulder. Front-3/4 view.',
  'hammer-curl':
    'standing upright curling a dumbbell in each hand with a neutral grip (palms facing each other, thumbs up), forearm vertical, elbows at the sides. Side view.',
  'ez-bar-curl':
    'standing upright curling a short EZ curl bar (a bar with zig-zag angled bends where the hands grip) with plates, elbows at sides, bar raised to chest. Front-3/4 view showing the zig-zag shape.',
  'preacher-curl':
    'seated at a preacher curl bench, upper arms resting flat on the angled pad, curling an EZ bar up toward the shoulders. Side view showing the angled pad.',
  'incline-dumbbell-curl':
    'seated back on an incline bench (about 45 degrees), arms hanging straight down behind the torso, curling a dumbbell in each hand. Side view.',
  'concentration-curl':
    'seated on the end of a flat bench, leaning forward, elbow braced against the inside of the thigh, curling one dumbbell up toward the shoulder. Front-3/4 view.',
  'cable-curl':
    'standing facing a cable tower, curling a straight bar attached to a LOW pulley up toward the chest with elbows at the sides. Side view.',
  'reverse-curl':
    'standing upright curling an EZ bar with an OVERHAND grip (knuckles up, palms facing down), elbows at the sides. Side view.',
  'wrist-curl':
    'seated on a bench, forearms resting along the thighs with hands hanging over the knees, palms up, curling a dumbbell in each hand with only the wrists. Side view, close enough to see the wrists.',
  'triceps-rope-pushdown':
    'standing facing a cable tower, elbows pinned at the sides, pushing a rope attachment from a high pulley down to the thighs, rope ends spread apart at the bottom. Side view.',
  'triceps-pushdown':
    'standing facing a cable tower, elbows pinned at the sides, pushing a short straight bar attached to a high pulley down to the thighs with straight arms. Side view.',
  'overhead-triceps-extension':
    'seated upright, holding ONE dumbbell with both hands behind the head, elbows pointing up at the ceiling, forearms bent down behind the head. Side view.',
  'cable-overhead-extension':
    'standing facing AWAY from a cable tower in a split stance, leaning forward, holding a rope from the high pulley behind the head and extending the arms forward overhead. Side view.',
  'skull-crusher':
    'lying flat on a bench holding an EZ bar above the forehead, upper arms vertical and elbows bent so the bar is lowered toward the forehead. Side view.',
  'close-grip-bench-press':
    'lying on a flat bench pressing an olympic barbell with a NARROW grip (hands about shoulder width or closer), elbows tucked close to the body. Front-3/4 view showing the narrow grip.',
  'triceps-kickback':
    'bent over with one knee and hand on a flat bench, upper arm held parallel to the floor, extending the forearm back to straighten the arm holding a dumbbell. Side view.',
  'bench-dip':
    'hands on the edge of a flat bench behind the body, legs extended forward with heels on the floor, elbows bent lowering the hips below the bench. Side view.',
  'triceps-dip':
    'on parallel dip bars with the torso UPRIGHT and vertical, legs straight down, elbows bent pointing back, lowering the body. Side view.',
  'diamond-push-up':
    'in a push-up with both hands close together under the chest so the thumbs and index fingers touch forming a diamond shape, body straight. Front-3/4 view showing the diamond hands.',

  // Legs
  'barbell-squat':
    'in a back squat at parallel depth: loaded olympic barbell across the upper back, feet shoulder width, hips down and back, thighs parallel to the floor, chest up. Side view.',
  'front-squat':
    'in a FRONT squat, side view: a loaded olympic barbell rests on the FRONT of the shoulders across the collarbones, in front of the neck and NOT behind it; the elbows are pushed high and point straight forward; hands hold the bar just outside the shoulders; torso very upright; deep squat with thighs parallel to the floor.',
  'goblet-squat':
    'in a deep squat holding ONE dumbbell vertically against the chest with both hands cupping the top end, elbows inside the knees, torso upright. Front-3/4 view.',
  'smith-squat':
    'squatting inside a Smith machine with the guided bar across the upper back, two vertical steel rails on either side, thighs near parallel. 3/4 view showing the rails.',
  'hack-squat':
    'on a hack squat machine: back and shoulders against an angled sliding pad, shoulders under the shoulder pads, feet on a large angled foot platform, knees bent deep. Side view.',
  'leg-press':
    'seated reclined in a 45-degree leg press machine, back against the seat, feet on a large angled sled platform, knees bent pushing the platform up. Side view showing the angled sled.',
  'bulgarian-split-squat':
    'in a Bulgarian split squat: rear foot laces-down on a flat bench behind, front foot planted forward, holding a dumbbell in each hand, front knee bent, back knee lowered toward the floor. Side view.',
  'walking-lunge':
    'mid-stride in a walking lunge holding a dumbbell in each hand at the sides, front knee bent 90 degrees, back knee close to the floor, torso upright. Side view.',
  lunge:
    'in a forward lunge with hands on the hips, front knee bent 90 degrees, back knee just above the floor, torso upright, no weights. Side view.',
  'step-up':
    'stepping up onto a plyo box holding a dumbbell in each hand, one foot on top of the box, the other leg rising from the floor. Side view.',
  'leg-extension':
    'seated in a leg extension machine, shins behind a padded roller, extending the knees to lift the roller until the legs are straight in front. Side view.',
  'lying-leg-curl':
    'lying face down on a leg curl machine, the padded roller behind the ankles, curling the heels up toward the glutes with the knees bent. Side view.',
  'seated-leg-curl':
    'seated in a leg curl machine with a pad over the thighs, legs extended over a roller behind the ankles, curling the heels down and back under the seat. Side view.',
  'romanian-deadlift':
    'in a Romanian deadlift: knees slightly bent, hips pushed far back, flat back, torso hinged forward, loaded barbell held in straight arms just below the knees. Side view.',
  'dumbbell-romanian-deadlift':
    'in a Romanian deadlift holding a dumbbell in each hand in front of the thighs, knees slightly bent, hips pushed back, flat back, dumbbells lowered to mid-shin. Side view.',
  'hip-thrust':
    'upper back resting on the edge of a flat bench, feet flat on the floor, a loaded barbell across the hips (with a pad), hips driven up so the torso and thighs form a straight horizontal line. Side view.',
  'glute-bridge':
    'lying on the back on a mat, knees bent and feet flat, arms on the floor, hips raised so the body forms a straight line from shoulders to knees. Side view.',
  'cable-kickback':
    'standing facing a cable tower, a strap around one ankle attached to a low pulley, kicking that straight leg back and up behind the body, holding the tower for balance. Side view.',
  'hip-abduction':
    'seated upright in a gym hip abduction machine, back against the seat pad, hands on the side handles, the outside of each knee against a padded lever arm, pushing the two padded arms outward away from each other. Front-3/4 view with the machine, its weight stack and the padded arms clearly visible.',
  'hip-adduction':
    'seated in a hip adduction machine with pads on the INSIDE of the knees, squeezing the legs together inward against the pads. Front view showing the legs closing.',
  'banded-lateral-walk':
    'in a half squat with a short resistance loop band around both legs just above the knees, stepping sideways with feet apart stretching the band. Front view.',
  'standing-calf-raise':
    'standing in a standing calf raise machine with shoulders under the padded yokes, balls of the feet on a raised step, heels lifted high on tiptoe. Side view.',
  'seated-calf-raise':
    'seated in a seated calf raise machine with a padded lever over the knees, balls of the feet on a foot bar, heels lifted pushing the knees up. Side view.',
  'bodyweight-squat':
    'in a bodyweight air squat at parallel depth, arms extended straight in front at shoulder height for balance, no weights, chest up. Side view.',
  'jump-squat':
    'exploding upward out of a squat: the whole body is airborne, both shoes clearly lifted well off the ground with a visible gap beneath them, legs extending, both arms swung up above the head. Side view.',
  'pistol-squat':
    'balancing on one leg in a full single-leg pistol squat, the other leg held straight out in front parallel to the floor, arms forward. Side view.',
  'box-jump':
    'landing softly on top of a tall plyo box in a half squat, both feet on the box, arms forward. Side view showing the box.',
  'wall-sit':
    'sitting against a vertical wall with no chair, back flat on the wall, knees bent at 90 degrees, thighs parallel to the floor, arms crossed. Side view with a section of wall visible.',
  'nordic-curl':
    'kneeling on a pad with ankles anchored under a bar, body straight from knees to head, leaning forward toward the floor slowly with hands ready to catch. Side view.',

  // Core
  crunch:
    'lying on the back on a mat with knees bent and feet flat, hands lightly behind the head, curling the shoulders and upper back off the floor. Side view.',
  'sit-up':
    'mid sit-up on a mat: knees bent and feet flat, torso raised upright about halfway, arms crossed over the chest. Side view.',
  'decline-crunch':
    'on a decline sit-up bench with feet hooked under the rollers at the high end, head lower, curling the torso up with hands behind the head. Side view.',
  'cable-crunch':
    'kneeling facing a cable tower, holding a rope attachment from the high pulley beside the head, crunching the torso down toward the knees, back rounded. Side view.',
  'bicycle-crunch':
    'lying on the back, hands behind the head, shoulders off the floor, twisting so one elbow meets the opposite knee while the other leg extends straight. Front-3/4 view.',
  'russian-twist':
    'seated on a mat leaning back in a V with feet lifted off the floor, hands clasped together twisting the torso to one side. Front-3/4 view.',
  plank:
    'holding a forearm plank: forearms and toes on the floor, body perfectly straight from head to heels. Side view.',
  'side-plank':
    'holding a side plank on one forearm with the body straight and stacked sideways, hips lifted, the other hand on the hip. Front view.',
  'hollow-hold':
    'lying on the back on a mat with lower back pressed down, arms stretched overhead and straight legs both raised a little off the floor, the body forming a shallow banana curve. Side view.',
  'lying-leg-raise':
    'lying on the back on a mat with hands by the hips, raising both straight legs together up to vertical. Side view.',
  'hanging-knee-raise':
    'hanging from a pull-up bar with straight arms, knees bent and pulled up toward the chest. Side view.',
  'hanging-leg-raise':
    'hanging from a pull-up bar with straight arms, raising both STRAIGHT legs up in front to horizontal, forming an L shape. Side view.',
  'toes-to-bar':
    'hanging from a pull-up bar, swinging both straight legs all the way up so the toes touch the bar between the hands. Side view.',
  'v-up':
    'balanced on the seat on a mat, simultaneously lifting straight legs and straight arms so the hands reach toward the toes forming a V shape. Side view.',
  'flutter-kicks':
    'lying on the back with hands under the hips, both straight legs a little off the floor, one leg higher than the other in a scissoring kick. Side view.',
  'dead-bug':
    'lying on the back with arms reaching up to the ceiling, one arm lowering overhead while the opposite leg extends straight toward the floor and the other knee stays bent at 90 degrees. Side view.',
  'bird-dog':
    'on hands and knees on a mat, extending one arm straight forward and the opposite leg straight back, both level with the flat back. Side view.',
  'mountain-climber':
    'in a high plank with straight arms, driving one knee toward the chest while the other leg is extended back, in running motion. Side view.',
  'ab-wheel':
    'kneeling on a mat holding an ab wheel with both hands, rolling it forward with arms extended so the body stretches out low and long. Side view.',
  'pallof-press':
    'standing side-on to a cable tower in an athletic stance, holding a cable handle at the chest with both hands and pressing it straight out in front, resisting the twist. Front view showing the cable pulling sideways.',

  // Full body
  'power-clean':
    'catching a loaded barbell in the front rack position on the shoulders with elbows high in a quarter squat, the finish of a power clean. Side view.',
  'clean-and-jerk':
    'in the split jerk: a loaded barbell locked out overhead, one leg forward and one leg back in a split stance. Side view.',
  snatch:
    'in the overhead squat catch of a snatch: a loaded barbell locked out overhead with a very wide grip, squatting deep with an upright torso. Front-3/4 view.',
  thruster:
    'in the MIDDLE of a thruster, strict side view: rising out of a half squat (knees bent about 45 degrees, hips below standing height) while a loaded olympic barbell travels up IN FRONT OF THE FACE at forehead height, elbows bent about 90 degrees and pointing forward, palms under the bar. The arms are NOT straight and the bar is NOT above the head: that would be an overhead squat or an overhead press. The legs and the press are moving at once.',
  'kettlebell-swing':
    'in the backswing of a two-handed kettlebell swing, side view: hips pushed far back in a hinge with a flat back and soft knees, chest leaning forward, both straight arms swinging one kettlebell back BETWEEN the thighs, the bell behind the line of the knees. Not standing upright and not holding the bell out in front.',
  'turkish-get-up':
    'mid Turkish get-up: half-seated on the floor propped on one hand, the other arm extended straight up holding a kettlebell overhead, one knee bent. Side view.',
  burpee:
    'at the bottom of a burpee, strict side view: crouched in a deep squat with BOTH palms flat on the floor just in front of the shoes, knees bent and drawn up to the chest, hips low and back, head forward, about to jump the feet back into a plank. Not a plank, not a push-up and not standing.',
  'wall-ball':
    'standing in front of a tall wall target, having squatted, throwing a soft medicine ball up toward the target with both hands overhead. Side view with the wall target.',
  'medicine-ball-slam':
    'slamming a heavy medicine ball down to the floor with both arms in front, torso bent forward, the ball near the ground. Side view.',
  'farmers-walk':
    'walking upright carrying a heavy dumbbell in each hand at the sides, arms straight, mid-stride. Side view.',
  'sled-push':
    'leaning forward at a steep angle pushing a weighted sled (loaded with plates) by its two vertical handles, driving with the legs. Side view.',
  'battle-ropes':
    'in a half squat holding the ends of two thick heavy battle ropes, making waves with alternating arms, the ropes rippling along the floor. Front-3/4 view.',
  'bear-crawl':
    'on hands and feet with knees hovering just above the floor and back flat, crawling forward. Side view.',
  'jumping-jacks':
    'mid jumping jack: feet apart wide, arms raised overhead in a star shape. Front view.',
  'high-knees':
    'running on the spot driving one knee up to hip height, arms pumping like sprinting. Side view.',

  // Cardio
  running:
    'running outdoors mid-stride, one foot off the ground, arms bent and swinging, wearing running shoes. Side view.',
  treadmill:
    'running on a treadmill, mid-stride on the moving belt, the treadmill console and handrails visible in front. Side view.',
  walking: 'walking briskly mid-stride with relaxed arm swing, wearing sneakers. Side view.',
  hiking:
    'hiking up a gentle slope with a small backpack and a trekking pole, wearing hiking boots, mid-stride. Side view.',
  cycling:
    'riding a road bicycle, hands on the handlebars, one pedal down, leaning forward, wearing a bike helmet. Side view.',
  'stationary-bike':
    'seated on an indoor stationary exercise bike, pedalling with hands on the handlebars; the bike has a flywheel and a console. Side view.',
  'air-bike':
    'riding an air bike (assault bike) with the large fan wheel at the front, pushing and pulling the moving arm handles while pedalling. Side view.',
  'rowing-machine':
    'on an indoor rowing machine (ergometer) at the finish of the stroke: legs extended, leaning back slightly, pulling the handle to the lower ribs; the flywheel housing and long rail visible. Side view.',
  elliptical:
    'striding on an elliptical cross-trainer, feet on the two oval-moving pedals, hands on the moving handles. Side view.',
  'stair-climber':
    'climbing on a stair climber machine with a revolving staircase, one foot stepping up, hands lightly on the side rails. Side view.',
  'jump-rope':
    'jumping rope, both feet just off the ground, the rope passing under the feet in an arc, handles in each hand at hip height. Front-3/4 view.',
  swimming:
    'swimming front crawl (freestyle) in a small patch of blue pool water, one arm reaching forward over the water, wearing swim cap and goggles. Side view.',
  hiit: 'mid-air in an explosive star jump with arms and legs spread wide, a stopwatch floating beside the figure to suggest intervals. Front view.',
  zumba:
    'dancing an energetic zumba move, one knee lifted, arms up and waving, cheerful pose. Front-3/4 view.',
  dance:
    'dancing freely in a graceful pose, one arm raised overhead and one leg stepping to the side. Front-3/4 view.',

  // Sports
  badminton:
    'playing badminton, lunging forward reaching up to hit a shuttlecock with a badminton racket overhead in a smash, the shuttlecock in the air. Side view.',
  basketball:
    'jumping to shoot a basketball with both hands overhead, the ball just leaving the fingertips. Side view.',
  football:
    'kicking a football (soccer ball) with the instep, the ball just in front of the foot, arms out for balance. Side view.',
  futsal:
    'dribbling a smaller futsal ball with the sole of the foot, body low and agile, wearing indoor court shoes. Side view.',
  tennis:
    'hitting a forehand with a tennis racket, mid swing, a yellow tennis ball near the racket strings. Side view.',
  'table-tennis':
    'standing at the edge of a table tennis table holding a ping pong paddle, hitting a small white ball over the net. 3/4 view showing part of the table and net.',
  squash:
    'lunging deep to hit a small black squash ball with a long thin squash racket, low to the floor. Side view.',
  pickleball:
    'hitting a perforated plastic pickleball with a solid flat pickleball paddle, ready position near a low net. Side view.',
  volleyball:
    'jumping to spike a volleyball with one arm high over the head, the ball above the hand. Side view.',
  'sepak-takraw':
    'performing a sepak takraw bicycle kick: flipping in mid-air sideways with one leg kicking high above the head to strike a woven rattan ball. Side view.',
  golf: 'at the end of a golf swing follow-through, the golf club wrapped over the shoulder, body rotated toward the target. Side view.',
  boxing:
    'in a boxing stance wearing red boxing gloves, throwing a straight jab with the lead hand, the rear glove guarding the chin. Side view.',
  'muay-thai':
    'throwing a muay thai roundhouse kick with the shin at waist height, wearing boxing gloves and shorts, arms guarding. Front-3/4 view.',
  'martial-arts':
    'in a martial arts stance wearing a white uniform (gi) with a black belt, executing a straight front punch from a low horse stance. Front-3/4 view.',
  climbing:
    'bouldering on a short section of indoor climbing wall with colourful holds, reaching up for a hold with one hand, feet on lower holds. 3/4 rear view.',
  rugby:
    'running forward carrying an oval rugby ball tucked under one arm, the other arm out to fend. Side view.',
  cricket:
    'batting in cricket, swinging a flat cricket bat in a drive, wearing batting pads on the legs. Side view.',
  hockey:
    'playing field hockey, bent forward dribbling a small ball with a curved hockey stick. Side view.',
  frisbee:
    'throwing a flying disc (frisbee) with a backhand throw, the disc just released. Side view.',
  skateboarding:
    'riding a skateboard, one foot on the board and the other pushing off the ground. Side view.',
  surfing:
    'standing on a surfboard riding a small wave, knees bent, arms out for balance, a curl of blue water under the board. Side view.',
  kayaking:
    'seated in a kayak on a small patch of water, paddling with a double-bladed paddle, one blade in the water. Side view.',

  // Mobility
  yoga: 'holding the yoga warrior II pose on a yoga mat: legs wide apart, front knee bent, arms extended straight out to both sides parallel to the floor. Front view.',
  pilates:
    'doing a pilates exercise on a mat: lying on the back with head and shoulders lifted, legs raised in tabletop, arms pumping by the sides (the hundred). Side view.',
  stretching:
    'seated on a mat with legs straight in front, reaching forward with both hands toward the toes in a hamstring stretch. Side view.',
  'foam-rolling':
    'lying with the back of the thighs on a foam roller on the floor, hands behind supporting the body, rolling the hamstrings. Side view.',
  'tai-chi':
    'performing a slow tai chi movement: knees softly bent, weight on one leg, both arms floating up in front with open palms. Front-3/4 view.',
}
