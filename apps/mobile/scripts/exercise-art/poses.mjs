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

  // Chest, added for parity with Strong
  'around-the-world':
    'lying flat on its back on a FLAT, LEVEL bench, holding a light dumbbell in each hand with STRAIGHT arms swept all the way OVERHEAD past the top of the head, arms extended behind the head toward the floor, palms up: the far end of a half circle that started at the hips. Side view, so the arms reaching back beyond the head are what reads; NOT a chest fly with the arms out to the sides.',
  'cable-bench-press':
    'lying flat on its back on a flat bench placed between the two towers of a cable machine, gripping a cable handle in each hand and pressing both handles straight up above the chest; the two cables run from low pulleys at the sides of the bench up to the hands. 3/4 view showing the cables.',
  'wide-grip-bench-press':
    'lying flat on its back on a flat bench, pressing an olympic barbell with a VERY WIDE grip, hands near the plates far outside the shoulders, arms extended above the chest; plates on both ends. Front-3/4 view so the wide grip is obvious.',
  'band-chest-fly':
    'standing upright with a resistance band anchored behind at chest height, holding one band end in each hand, arms opened wide out to the sides with a slight elbow bend at the start of a fly; the colored band is clearly visible running behind. Front-3/4 view.',
  'band-chest-press':
    'standing in a split stance with a resistance band wrapped behind the upper back, holding one band end in each hand and pressing both hands straight forward at chest height, arms nearly extended; the colored band is clearly visible. Side view.',
  'assisted-chest-dip':
    'kneeling on the padded knee platform of an assisted dip machine, hands on the two parallel dip handles, body upright and lowered with elbows bent behind; the tall machine frame and weight stack behind. Side view.',
  'decline-dumbbell-press':
    'lying on a decline bench with the head lower than the hips and legs hooked under the foot pads, pressing a pair of dumbbells straight up above the lower chest with arms extended. Side view so the decline angle is obvious.',
  'smith-decline-press':
    'lying on a decline bench inside a Smith machine, head lower than hips, legs hooked under the foot pads, pressing the Smith machine bar fixed to two vertical guide rails up above the lower chest. 3/4 view showing the rails and the decline.',
  'floor-press':
    'lying flat on its back ON THE FLOOR (no bench), knees bent and feet flat, pressing an olympic barbell straight up above the chest with arms extended; upper arms resting near the floor at the bottom. Side view showing there is no bench.',
  'cable-incline-press':
    'lying on an incline bench set at about 30-45 degrees between two cable towers, pressing two cable handles up above the upper chest; cables run from low pulleys at the sides. Side-3/4 view showing the incline and the cables.',
  'smith-incline-press':
    'lying on an incline bench set at about 30-45 degrees inside a Smith machine, pressing the Smith bar fixed to two vertical guide rails up above the upper chest. 3/4 view showing the rails and the incline.',
  'incline-machine-press':
    'seated on an incline chest press machine with the backrest reclined, pushing two handles forward and UPWARD on an angled path above the upper chest, arms nearly extended; weight stack visible. Side view showing the upward pressing angle.',
  'iso-lateral-chest-press':
    'seated on a plate-loaded iso-lateral chest press machine (two independent lever arms with weight plates loaded on horn pegs), pushing both handles forward at chest height; the separate plate-loaded levers are clearly visible. Side-3/4 view.',
  'banded-push-up':
    'in a push-up position at the top with arms straight, a resistance band stretched across the upper back with each end held under the hands on the floor; the colored band clearly visible across the back. Side-3/4 view.',

  // Back, added for parity with Strong
  'machine-back-extension':
    'seated upright in a back extension machine, upper back pressed against a padded roller, hips strapped in, leaning BACK against the pad with the torso extended; weight stack visible. Side view.',
  'band-row':
    'standing with both feet on the middle of a resistance band, hinged forward at the hips with a flat back, pulling the band ends up toward the lower ribs with elbows driven back; the colored band clearly visible. Side view.',
  'dumbbell-bent-over-row':
    'standing hinged forward at the hips about 45 degrees with a flat back and soft knees, a dumbbell in EACH hand, pulling both dumbbells up toward the lower ribs at the same time, elbows back. Side view.',
  'underhand-barbell-row':
    'standing hinged forward at the hips with a flat back, holding an olympic barbell with an UNDERHAND grip (palms facing forward/up), pulling the bar into the lower stomach with elbows close to the sides. Side view showing the palms-up grip.',
  'assisted-chin-up':
    'kneeling on the padded platform of an assisted pull-up machine, gripping the handles overhead with an UNDERHAND grip (palms facing toward the face), pulled up so the chin is near hand height; tall machine frame and weight stack. Front-3/4 view showing the palms-facing-in grip.',
  'band-deadlift':
    'standing upright at the top of a deadlift with both feet on a resistance band, holding the band ends in each hand at the hips with arms straight, the band stretched taut from the feet; the colored band clearly visible. Side view.',
  'dumbbell-deadlift':
    'hinged at the hips at the bottom of a deadlift with a flat back, knees bent, holding a dumbbell in each hand just in front of the shins, about to stand up. Side view.',
  'smith-deadlift':
    'standing at the top of a deadlift inside a Smith machine, holding the Smith bar (fixed to two vertical guide rails) at the thighs with straight arms, hips locked out. 3/4 view showing the rails.',
  'deficit-deadlift':
    'standing ON a low raised plate platform, bent over at the start of a deadlift gripping an olympic barbell with plates resting on the floor BELOW the level of its feet, back flat, hips low. Side view showing the feet elevated above the bar.',
  'iso-lateral-row':
    'seated facing a plate-loaded iso-lateral row machine, chest against the chest pad, pulling two independent lever handles back toward the torso with elbows behind; plates loaded on the lever horns. Side view.',
  'band-kneeling-pulldown':
    'kneeling upright on the floor below a resistance band anchored high overhead, pulling the band ends down to the shoulders with elbows driven down beside the ribs; the colored band clearly visible above. Side-3/4 view.',
  'machine-lat-pulldown':
    'seated in a plate-loaded or selectorized lat pulldown MACHINE with thigh pads, pulling two separate lever handles down from overhead to shoulder level (no cable bar, rigid lever arms). Front-3/4 view.',
  'single-arm-pulldown':
    'seated or half-kneeling below a high cable pulley, pulling a SINGLE D-handle down with ONE arm to the side of the chest, the other hand resting on the thigh; one cable visible. Front-3/4 view.',
  'band-underhand-pulldown':
    'kneeling upright below a resistance band anchored high overhead, holding the band ends with an UNDERHAND grip (palms facing the body) and pulling down to the shoulders. Front-3/4 view.',
  'underhand-pulldown':
    'seated at a lat pulldown cable station with thighs under the pads, pulling a straight bar down to the upper chest with an UNDERHAND shoulder-width grip (palms facing the face). Front-3/4 view showing the palms-facing grip.',
  'wide-grip-pulldown':
    'seated at a lat pulldown cable station with thighs under the pads, pulling a long lat bar down to the upper chest with a VERY WIDE overhand grip near the bent ends of the bar. Front view so the wide grip is obvious.',
  'pendlay-row':
    'bent over with the torso PARALLEL to the floor and a flat back, pulling an olympic barbell from a dead stop on the floor explosively up to the lower chest; plates near the floor. Side view showing the horizontal torso.',
  'band-assisted-pull-up':
    'hanging from a pull-up bar with an overhand grip, a thick resistance band looped over the bar and under one bent knee for assistance, pulled up near the top with chin approaching the bar. Front-3/4 view showing the band.',
  'machine-pullover':
    'seated in a pullover machine with the upper arms against curved pads, elbows pushing a lever arm down in an arc from overhead to in front of the torso; weight stack visible. Side view.',
  'wide-grip-cable-row':
    'seated at a low cable row station with feet on the platform and torso upright, pulling a WIDE straight bar to the lower chest with elbows flared out wide. Side-3/4 view showing the wide bar.',
  'machine-shrug':
    'standing in a shrug machine, holding the two machine handles at the sides with straight arms, shoulders raised up toward the ears at the top of a shrug; weight stack or plates visible. Front-3/4 view.',
  'smith-shrug':
    'standing upright inside a Smith machine holding the Smith bar (fixed to two vertical guide rails) at the thighs with straight arms, shoulders shrugged up toward the ears. Front-3/4 view showing the rails.',
  'wide-pull-up':
    'hanging from a pull-up bar with a VERY WIDE overhand grip far outside the shoulders, pulled up with chin above the bar and elbows flared out. Front view so the wide grip is obvious.',
  'kipping-pull-up':
    'on a pull-up bar mid-kip: body swinging in an arch with the legs driven forward and the hips snapping up, hands in an overhand grip, chin rising toward the bar. Side view showing the swinging kip.',
  'muscle-up':
    'on a pull-up bar at the transition of a bar muscle-up: torso already above the bar, leaning forward over it, elbows bent beside the bar about to press out to straight arms. Side view.',

  // Shoulders, added for parity with Strong
  'band-front-raise':
    'standing upright on the middle of a resistance band, raising both band ends straight forward with straight arms to shoulder height; the colored band clearly visible running from the feet. Side view.',
  'barbell-front-raise':
    'standing upright raising an olympic barbell with an overhand grip straight forward with straight arms to shoulder height. Side view.',
  'cable-front-raise':
    'standing upright facing away from a low cable pulley, the cable running between the legs, raising a straight bar or handle forward with straight arms to shoulder height. Side view showing the cable.',
  'plate-front-raise':
    'standing upright holding a single round weight plate by its sides with both hands, raising it straight forward with straight arms to shoulder height. Side view.',
  'band-lateral-raise':
    'standing upright on a resistance band, raising both band ends out to the sides with nearly straight arms to shoulder height, forming a T; the colored band clearly visible. Front view.',
  'machine-lateral-raise':
    'seated in a lateral raise machine, upper arms against the side pads, raising both arms out to the sides to shoulder height; weight stack visible. Front-3/4 view.',
  'cable-overhead-press':
    'standing or seated between two cable towers, pressing two cable handles from shoulder height straight up overhead, cables running from low pulleys at the sides. Front-3/4 view showing the cables.',
  'standing-dumbbell-press':
    'STANDING upright (no bench), pressing a pair of dumbbells overhead with arms nearly extended, dumbbells above the shoulders. Front-3/4 view.',
  'smith-overhead-press':
    'seated on an upright bench inside a Smith machine, pressing the Smith bar (fixed to two vertical guide rails) from in front of the shoulders up overhead. 3/4 view showing the rails.',
  'seated-barbell-press':
    'seated upright on a bench with back support, pressing an olympic barbell from the front of the shoulders straight up overhead, arms nearly extended. Side-3/4 view.',
  'cable-reverse-fly':
    'standing between two high cable pulleys with the cables crossed in front, pulling the handles out and back to the sides with straight arms at shoulder height (reverse fly). Rear-3/4 view.',
  'push-press':
    'standing with an olympic barbell resting on the FRONT of the shoulders, caught in the DIP: knees clearly bent in a short quarter squat, torso upright, about to drive the legs up and push the bar overhead. Side view, so the bent knees and the bar at the shoulders are what reads, not a strict press.',
  'cable-upright-row':
    'standing upright facing a low cable pulley, pulling a straight bar attached to the cable up the front of the body to chest height with elbows high and out to the sides. Front-3/4 view.',
  'dumbbell-upright-row':
    'standing upright pulling a pair of dumbbells up the front of the body to chest height with elbows high and out to the sides. Front-3/4 view.',

  // Arms, added for parity with Strong
  'machine-curl':
    'seated at a biceps curl machine with the upper arms on an angled pad, curling the machine handles up toward the shoulders; weight stack visible. Side view.',
  'band-hammer-curl':
    'standing on a resistance band, curling both band ends up toward the shoulders with a NEUTRAL grip (palms facing each other), elbows at the sides; the colored band clearly visible. Front-3/4 view.',
  'cable-hammer-curl':
    'standing facing a low cable pulley, curling a ROPE attachment up toward the shoulders with a neutral grip (palms facing each other), elbows at the sides. Side-3/4 view showing the rope.',
  'dumbbell-preacher-curl':
    'seated at a preacher curl bench, one upper arm resting flat on the angled pad, curling a single dumbbell up toward the shoulder. Side view showing the angled pad.',
  'machine-preacher-curl':
    'seated at a preacher curl machine, upper arms flat on the angled pad, curling the machine lever handles up toward the shoulders; weight stack visible. Side view.',
  'band-reverse-curl':
    'standing on a resistance band, curling both band ends up with an OVERHAND grip (knuckles up, palms down), elbows at the sides. Side view.',
  'dumbbell-reverse-curl':
    'standing upright curling a pair of dumbbells with an OVERHAND grip (knuckles up, palms facing down), elbows at the sides, forearms raised toward horizontal. Side view.',
  'reverse-concentration-curl':
    'seated on the end of a bench, elbow braced against the inside of the thigh, curling a single dumbbell with an OVERHAND grip (palm facing down). Front-3/4 view.',
  'dumbbell-skullcrusher':
    'lying flat on a bench holding a dumbbell in each hand above the forehead, upper arms vertical and elbows bent so the dumbbells are lowered beside the head. Side view.',
  'assisted-dip':
    'kneeling on the padded platform of an assisted dip machine, gripping the two parallel dip handles with the torso UPRIGHT and arms pressing down toward straight (triceps dip). Side view.',
  'barbell-triceps-extension':
    'seated upright holding an EZ or straight barbell overhead with both hands, elbows pointing to the ceiling, forearms bent down behind the head. Side view.',
  'machine-triceps-extension':
    'seated at a triceps extension machine with the upper arms resting on a pad, extending the forearms to push the handles down and out to straight arms; weight stack visible. Side view.',
  'cable-triceps-kickback':
    'hinged forward at the hips beside a low cable pulley, upper arm pinned parallel to the torso, extending ONE arm straight back holding the cable handle (triceps kickback). Side view showing the cable.',
  'wrist-roller':
    'standing upright with arms straight out in front at shoulder height, both hands gripping a short wrist roller bar with a rope hanging down to a small weight plate, wrists rolling the rope up. Side view.',

  // Legs, added for parity with Strong
  'box-squat':
    'squatting with an olympic barbell on the upper back, sitting back onto a flat plyo box placed behind, shins vertical, about to stand up. Side view showing the box under the hips.',
  'calf-press':
    'seated reclined in a 45-degree leg press machine with the legs nearly straight, only the balls of the feet on the bottom edge of the sled platform, pointing the toes to push the platform. Side view focused on the calves and feet.',
  'cable-pull-through':
    'standing facing AWAY from a low cable pulley, the rope attachment held between the legs, hinged forward at the hips with a flat back, about to drive the hips forward. Side view showing the cable between the legs.',
  'glute-ham-raise':
    'on a glute-ham developer (GHD) machine, knees on the pad and ankles locked under the foot rollers, body straight and horizontal, curling up with the hamstrings. Side view showing the machine.',
  'machine-glute-kickback':
    'standing or kneeling in a glute kickback machine, chest on the pad, pushing the foot plate straight back and up with one leg extended behind; weight stack visible. Side view.',
  'kettlebell-goblet-squat':
    'in a deep squat holding ONE KETTLEBELL by its horns (handle) at the chest with both hands, elbows inside the knees, torso upright. Front-3/4 view showing the kettlebell.',
  'barbell-hack-squat':
    'standing up from the floor holding an olympic barbell BEHIND the legs with straight arms, bar at the back of the thighs, knees bent at the bottom of the lift. Side view showing the bar behind the legs.',
  'bodyweight-hip-thrust':
    'upper back resting across a flat bench, feet flat on the floor, hips driven up so the torso and thighs form a straight line, hands across the stomach, no weight. Side view.',
  'lateral-box-jump':
    'jumping SIDEWAYS onto a plyo box, captured mid-air beside the box with knees tucked, arms swinging, the box to the side of the body. Front view showing the sideways jump.',
  'barbell-lunge':
    'in a forward lunge with an olympic barbell across the upper back, front knee bent 90 degrees, back knee lowered toward the floor. Side view.',
  'dumbbell-lunge':
    'in a stationary forward lunge holding a dumbbell in each hand at the sides, front knee bent 90 degrees, back knee lowered toward the floor. Side view.',
  'overhead-squat':
    'in a deep squat holding an olympic barbell locked out overhead with a WIDE snatch grip and straight arms, torso upright. Front-3/4 view.',
  'single-leg-bridge':
    'lying on its back with one foot flat on the floor and the other leg extended straight in the air, hips lifted so the torso and thigh form a straight line. Side view.',
  'band-squat':
    'standing in a squat with feet on a resistance band, band ends looped over the shoulders, knees bent at the bottom of the squat; the colored band clearly visible. Front-3/4 view.',
  'dumbbell-squat':
    'in a squat holding a dumbbell in each hand at the sides with straight arms, thighs near parallel, torso upright. Side-3/4 view.',
  'machine-squat':
    'in a pendulum or V-squat machine: shoulders under the curved shoulder pads, back against the pad, feet on a flat foot platform, knees bent deep in a squat; plate-loaded lever arm visible. Side view.',
  'barbell-calf-raise':
    'standing upright with an olympic barbell across the upper back, raised high up on the toes at the top of a calf raise. Side view.',
  'bodyweight-calf-raise':
    'standing upright on the edge of a low step, hands lightly on a wall, raised high on the toes at the top of a calf raise, no weight. Side view.',
  'dumbbell-calf-raise':
    'standing upright holding a dumbbell in each hand at the sides, raised high on the toes at the top of a calf raise. Side view.',
  'smith-calf-raise':
    'standing inside a Smith machine with the Smith bar (fixed to two vertical guide rails) across the upper back, toes on a low block, raised high on the toes. 3/4 view showing the rails.',
  'stiff-leg-deadlift':
    'hinged forward at the hips with the LEGS STRAIGHT (knees locked or nearly locked) and a flat back, an olympic barbell lowered to the shins with straight arms. Side view showing the straight legs.',
  'dumbbell-stiff-leg-deadlift':
    'hinged forward at the hips with nearly straight legs and a flat back, a dumbbell in each hand lowered to the shins with straight arms. Side view.',
  'band-straight-leg-deadlift':
    'standing on a resistance band, hinged forward with straight legs and a flat back, holding the band ends at the shins; the colored band clearly visible. Side view.',
  'zercher-squat':
    'in a squat holding an olympic barbell in the CROOKS OF THE ELBOWS in front of the body (arms bent, bar cradled at the elbows), torso upright. Side-3/4 view showing the bar in the elbows.',

  // Core, added for parity with Strong
  'cable-twist':
    'standing side-on to a cable tower, holding a single handle with both hands and straight arms, rotating the torso diagonally across the body in a woodchop from high to low. Front-3/4 view showing the cable.',
  'cross-body-crunch':
    'lying on its back with knees bent, one hand behind the head, crunching up and twisting to bring that elbow toward the opposite raised knee. 3/4 view.',
  'machine-crunch':
    'seated in an ab crunch machine, chest against the pad or holding the handles at the chest, curled forward in a crunch; weight stack visible. Side view.',
  'stability-ball-crunch':
    'lying with the lower back on a large inflatable stability ball, feet flat on the floor, hands behind the head, crunching the shoulders up. Side view showing the ball.',
  'flat-knee-raise':
    'lying flat on its back on a flat bench, hands holding the bench behind the head, knees bent and drawn up toward the chest. Side view.',
  'jackknife-sit-up':
    'lying on its back folding the body in half: straight legs and straight arms lifting to meet above the hips, hands reaching toward the toes. Side view.',
  'captains-chair-knee-raise':
    "supported upright in a captain's chair (vertical knee raise station): forearms on the padded armrests, back against the backrest, knees raised to hip height with the feet off the ground. Side view showing the station.",
  'knees-to-elbows':
    'hanging from a pull-up bar with straight arms, knees driven up high so they touch the elbows. Side view.',
  'oblique-crunch':
    'lying on its side with legs stacked and slightly bent, bottom arm on the floor, top hand behind the head, crunching the torso sideways toward the hip. Front view.',
  'reverse-crunch':
    'lying on its back with arms flat at the sides, knees bent, curling the hips up off the floor and bringing the knees toward the chest. Side view.',
  'reverse-plank':
    'facing UP, supported on straight arms with hands under the shoulders and heels on the floor, body in a straight line from shoulders to heels. Side view.',
  'band-side-bend':
    'standing upright with one foot on a resistance band, holding the other end in one hand at the side, bending the torso sideways away from the band. Front view.',
  'cable-side-bend':
    'standing side-on to a low cable pulley holding a handle in one hand at the side, bending the torso sideways away from the cable. Front view showing the cable.',
  'dumbbell-side-bend':
    'standing upright holding ONE dumbbell in one hand at the side, the other hand behind the head, bending the torso sideways toward the dumbbell. Front view.',
  'torso-rotation':
    'seated in a rotary torso machine, chest against the pad and arms on the handles, the torso rotated to one side against the machine; weight stack visible. Front-3/4 view.',

  // Full body, added for parity with Strong
  clean:
    'catching an olympic barbell in the FRONT RACK (bar resting on the front of the shoulders, elbows high and forward) at the bottom of a DEEP front squat. Side view.',
  'deadlift-high-pull':
    'standing extended up on the toes, pulling an olympic barbell with a narrow overhand grip up to chest height with elbows high and out to the sides, at the top of a high pull from the floor. Side-3/4 view.',
  'hang-clean':
    'starting from the hang: standing tall having just pulled an olympic barbell from mid-thigh, receiving it in the front rack on the shoulders with elbows high, knees slightly bent. Side view.',
  'hang-snatch':
    'receiving an olympic barbell locked out OVERHEAD with a wide snatch grip, in a partial squat, after pulling it from the thighs. Front-3/4 view.',
  'jump-shrug':
    'jumping up off the toes with an olympic barbell held at the hips with straight arms, shoulders shrugged up toward the ears, feet just leaving the floor. Side view.',
  'power-snatch':
    'standing in a quarter squat (NOT a deep squat) with an olympic barbell locked out overhead with a WIDE snatch grip and straight arms. Front-3/4 view.',
  'press-under':
    'in a deep overhead squat position pressing an empty olympic barbell up from behind the neck with a wide snatch grip, arms bending as it moves overhead. Side-3/4 view.',
  'snatch-pull':
    'standing extended on the toes with an olympic barbell pulled to the hips with a WIDE snatch grip and STRAIGHT arms, shoulders shrugged, hips fully extended. Side view.',
  'split-jerk':
    'in a split stance (one foot forward, one foot back, knees bent) with an olympic barbell locked out overhead with straight arms. Side view showing the split legs.',
  'sumo-high-pull':
    'standing in a wide sumo stance pulling an olympic barbell with a NARROW grip up to chin height with elbows high above the hands. Front-3/4 view showing the wide stance.',
  'kettlebell-thruster':
    'standing up out of a squat pressing TWO kettlebells from the shoulders straight up overhead in one movement, knees extending. Front-3/4 view.',
  'band-squat-row':
    'in a half squat facing a resistance band anchored at chest height, pulling the band ends into the ribs with elbows back as the knees bend. Side view.',

  // Cardio, added for parity with Strong
  aerobics:
    'in an aerobics class step: arms reaching up in a V overhead, one knee lifted in a high step, energetic and bouncy, wearing workout shoes. Front-3/4 view.',
}
