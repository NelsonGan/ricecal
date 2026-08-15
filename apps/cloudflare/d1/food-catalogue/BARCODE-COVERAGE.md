# Why the scanner misses Malaysian packets

Measured 12 August 2026, against the live D1 catalogue and the Open Food Facts
nightly dump of 29 July 2026 (`data/raw/open_food_facts/food.parquet` in the
sibling `ricecal-food-database` repo).

The short version: **we are already carrying almost everything Open Food Facts
has for Malaysia, and Open Food Facts barely has Malaysia.** Nothing in this
repo's pipeline is filtering Malaysian packets out. The source is the ceiling,
and the only ways past it are to buy a second source or to make the data.

---

## What we hold

```
product rows in D1                       3,228,419
  GS1 Malaysia prefix (955…)                 4,333
  Thailand      (885…)                      12,997
  Singapore     (888…)                       3,764
  Philippines   (480…)                       3,554
  Indonesia     (899…)                       2,223
  Japan         (49…)                       25,781
  China      (690-695…)                      8,599
```

Malaysia, the home market, is 0.13% of the catalogue and the thinnest shelf in
Southeast Asia bar Indonesia.

## What Open Food Facts has

```
tagged en:malaysia                           6,607
  …with a full macro panel                   2,278   (34%)

GS1 Malaysia prefix (955…)                   9,280
  …with a product name                       8,624
  …with a full macro panel                   4,489   (52%)
  …named, with an energy figure but
     an incomplete panel                        86
  …named, with NO energy figure at all       4,049   (47%)
```

**We hold 4,333 of the 4,489 usable ones. That is 96.5% of what the source can
give us.** The remainder is drift between the dump we loaded and the one on
disk, not a filter.

The pipeline is not the problem, and it is worth being explicit about why,
because the obvious next move is to go and load more of Open Food Facts. There
is nothing left to load. `sources/open_food_facts.py` in the sibling
`ricecal-food-database` repo already takes **every** product in the dump with a
name, a code and a full macro panel — 3.2 million of them — and keeping them in
`product` rather than `food` is what keeps the American supermarket half out of
a Malaysian name search. The cut that used to throw packets away is gone.

## And the rows we do hold are thin

Of the 4,333 Malaysian-prefix products in D1:

| | count | share |
|---|---|---|
| no brand recorded | 919 | 21% |
| no serving weight | 1,881 | 43% |
| named in French rather than English or Malay | ~210 | 5% |

The French names are the tell, and they explain the whole shape of this. The
Malaysian products Open Food Facts knows about are largely the ones **exported
to Europe and scanned there** by European contributors: Mamee instant noodles
entered as "Nouilles instantanées saveur poulet". A few 955-prefix rows are not
Malaysian products at all (an Australian Coles muffin, a French chocolatier),
which is a contributor keying a code wrongly.

So even inside our 4,333, the overlap with what is on a shelf in Kuala Lumpur is
smaller than the number suggests. What is missing is the ordinary middle of a
Malaysian aisle: 99 Speedmart house brands, Gardenia and Massimo bread, Yeo's
and F&N drinks, Julie's and Munchy's biscuits, Adabi and Babas spice mixes, the
Ramly and Ayamas freezer.

## The size of the gap

GS1 Malaysia has close to 9,100 member companies across all industries, each
licensed to issue codes. A large Malaysian hypermarket carries tens of thousands
of grocery SKUs. Against that, 4,333 rows of mixed quality is a scanner that
will miss most of what anybody points it at.

---

## The options, and what each is actually worth

### 1. Buy a second barcode source

**FatSecret Platform API** is the strongest candidate. The Premier edition
claims 2.3M+ foods, "more than 58 local and unique data sets", and 90%+ global
UPC/EAN barcode coverage, with a v2 barcode method that returns the full food
object rather than an id. Caching is listed as a platform feature. Pricing is
"based on the number of markets you would like to access" and is quote-only.

The thing to establish before paying, and the reason this is not already a
recommendation: **Malaysia is not named in their published market list**, and a
global 90% coverage figure is dominated by the US and Europe. The question to
put to them is narrow and answerable: *how many GTINs beginning 955 do you hold
with a complete macro panel, and may we store them?* Anything under a few tens
of thousands is not worth a contract.

Nutritionix and Edamam are US-centric and will be worse here. Syndigo /
1WorldSync sell GDSN retail data, which is priced for brand owners rather than
apps.

### 2. GS1 Malaysia

`databank.gs1my.com` is the official Verified by GS1 portal, and it is the
authoritative answer to "what is this code". It is also the wrong shape: it is
web-only with no public API (both `/api/search` and a direct query return 404 /
403), and Verified by GS1 returns identity attributes — brand, name, category,
image — **not nutrition**. GS1 Malaysia's Member Product Databank and GDSN can
carry the nutrition attribute group, but that is trading-partner access
negotiated per member, not a dataset an app buys.

Worth one email to `databank@gs1my.org`; not worth planning around.

### 3. Ministry of Health, Healthier Choice Logo

`myhcl.moh.gov.my/index.php/site/productlist` lists the HCL-certified products
(around 3,500 across 60+ food categories). The listing carries **product name
and company only** — no barcode, no nutrition, no export. It is a good list of
which Malaysian SKUs exist and who makes them, which makes it useful as a
TARGET list. It is not a source of numbers.

### 4. Retailers and manufacturers

Malaysian online grocers list the SKUs, and manufacturers publish panels. Both
put the nutrition panel in a product PHOTOGRAPH more often than in text, both
have terms of use that a bulk crawl would sit badly with, and neither publishes
barcodes reliably. This is a real source and an expensive one, and it should
come after the two below rather than before.

### 5. Close the loop in the app  ← **recommended first move**

Every piece of this already exists, which is what makes it the cheapest thing on
the list and the only one that improves with use:

- `scan-meal` already reads a **nutrition panel** off a photograph and stops
  there — the first tier of the cascade. A packet's panel is the exact thing it
  is best at.
- The `barcode` function already **writes catalogue rows as `service_role`**
  when Open Food Facts answers live, and the Worker's `POST /product` is already
  an insert-or-ignore. There is a write path.
- `barcode_misses` already records **every code that missed**, with `found`
  separating "the catalogue was thin" from "nobody anywhere knows this packet".
  That table is a demand-ordered work list: it says which packets Malaysians
  actually scan, which is a far better target than 9,100 GS1 members.
- The scan flow now ENDS somewhere that can carry the offer. A miss lands on its
  own screen with "We do not have this one yet" on it, and "photograph the
  label" belongs beside "Describe it instead".

Two things make this convert rather than nag:

**Name the packet even when we cannot price it.** Those 4,049 Malaysian rows
with a name and no energy figure are exactly this case. Carried in a second D1
table — `product_stub(barcode, name, brand)`, so the not-null macro columns on
`product` keep meaning what they mean — a miss becomes "Gardenia Original
Classic. We do not have its numbers yet: point the camera at the label." That is
a different question to answer than a blank code.

**Decide what one person's photograph is worth.** A panel read from one user's
photo is a claim, not a measurement, and it must not silently become everyone's
truth. The cheap version is provenance (`source_id = 'user_panel'`, unverified,
never outranking a measured row); the strong version is agreement between two
independent captures of the same code before it is promoted.

### 6. Contribute back to Open Food Facts

Whatever we capture in (5) should go back. Open Food Facts takes writes at
`/cgi/product_jqm2.pl` with an app account, and asks for `app_name`,
`app_version` and a salted per-user `app_uuid` so their moderators can ban one
bad contributor rather than the whole app. We serve their data under ODbL and
already credit them on the detail screen; feeding the panel back is both the
decent answer and a direct investment in the source we depend on. It also means
the next Malaysian nutrition app does not have to solve this again.

---

## What to do, in order

1. **Ship the capture loop** (5). It needs the stub table, one new tier on the
   miss screen, and a write through the Worker. It is the only option that costs
   nothing per packet and gets better every week.
2. **Work `barcode_misses` by hand** while volume is low. A few hundred codes
   entered from photographs of real shelves is a week of somebody's time and
   covers the top of the distribution, which is where almost all scans land.
3. **Ask FatSecret the narrow question** (1), and only sign if the 955-prefix
   answer is large and storable.
4. **Contribute upstream** (6) as soon as (1) writes anything.

Everything else on this page is a source to remember, not a plan.

---

## Re-measured, 14 August 2026

The conclusion above survives, and it is now measured twice rather than once.
Three things were tried in a single pass and only the first two added anything.

**Open Food Facts, the delta since the dump.** `static.openfoodfacts.org/data/delta/`
publishes a file a day and keeps about a fortnight of them. Reading all thirteen
gave 85,472 records, 59,519 with a complete panel, **7,745 of them codes D1 did
not hold** — 450 on Asian GS1 prefixes.

**And it is worth re-running, which was measured rather than assumed.** A file
covering the next two days landed the same afternoon and carried a further
**2,829** new codes. That is roughly 1,400 a day, so the delta is the one barcode
source here that pays a standing dividend: a weekly pass costs a few minutes and
nothing else on this page adds a row without a contract or a code change.

That load also found something the sibling repo needs to know: **Open Food Facts
has moved the panel out of `nutriments`.** It is now
`nutrition.aggregated_set.nutrients.<key>.value`, with the basis in
`aggregated_set.per`. A reader written against the old key does not error — it
found four usable products in 85,000 and looked like a quiet fortnight.

**USDA FoodData Central, Branded Foods.** 1,993,673 rows collapse to 441,858
distinct GTINs (FDC keeps every label revision), 431,852 of them with a name and
a complete panel. **16,500 were new.** The other 96% were already here, which is
worth knowing on its own: Open Food Facts already carries almost all of FDC
Branded, so that is not a second source so much as a footnote to the first.
31,108 of its GTINs sit on Asian prefixes, which is why it was worth checking.

**Walking Open Food Facts per country was abandoned, and the abandonment is the
finding.** Sampling pages from the middle of six countries' catalogues found
97% already held (India 56/61, Korea 83/84, Vietnam 41/42, Thailand 25/26).
A sequential sweep of Malaysia then read 1,000 products from page one and added
**zero**. At roughly a page a minute against their search API, the remaining tail
is not worth thirteen hours. Open Food Facts is exhausted for these shelves, in
the specific sense that everything it holds with a usable panel is already here.

```
product rows in D1                     3,228,419 → 3,255,494

  GS1 Malaysia   (955…)                    4,333 → 4,366
  Thailand       (885…)                   12,997 → 13,034
  Singapore      (888…)                    3,764 → 3,775
  Philippines    (480…)                    3,554 → 3,599
  Indonesia      (899…)                    2,223 → 2,236
  Vietnam        (893…)                    3,681 → 3,707
  Japan          (45…, 49…)               34,540 → 34,736
  China          (690-699…)               11,472 → 11,541
  Korea          (880…)                    8,543 → 8,599
  Taiwan         (471…)                    5,165 → 5,187
  Hong Kong      (489…)                    2,845 → 2,869
  India          (890…)                   11,103 → 11,242
  Sri Lanka      (479…)                      942 → 943
  Pakistan       (896…)                      829 → 842
  Myanmar        (883…)                       65 → 66
```

Myanmar is 66 packets. That is the whole shelf, and no amount of loading fixes
it, because Open Food Facts has 368 Myanmar products in total and most carry no
panel. Option (5) — the capture loop — remains the only thing on this page that
can move a number like that.

### The three sources that would have helped, and why they did not

**Korea (MFDS).** `식품안전나라` publishes 바코드연계제품정보 (service C005) and
유통바코드 (I2570), which are exactly a barcode-to-product join, and the
식품영양성분 통합DB behind them. Every route — foodsafetykorea.go.kr's download
page, data.go.kr's file and API datasets, data.mfds.go.kr — requires a registered
account. Worth an hour when somebody is willing to sign up; the payoff is the
880 shelf, currently 8,587 rows of Open Food Facts leftovers.

**Taiwan (TFDA).** `data.fda.gov.tw` serves its open datasets with no auth at all
and one of them (`InfoId=20`) is the national food composition table, which is
now loaded. None of the other twenty-odd datasets is a packaged-product register
with barcodes; 食品登錄平台's product registry is not among them.

**Philippines (FNRI).** PhilFCT is behind a registration wall at
`i.fnri.dost.gov.ph`, and it is a composition table rather than a barcode source
in any case.

### The French names cannot be fixed from Open Food Facts either

The measurement above says ~210 of the Malaysian-prefix rows are named in French.
Asking Open Food Facts for each one's `product_name_en`, `product_name_ms`,
`product_name_id` or `generic_name_en` returned a usable alternative for **3 of
168**. The rest have exactly one name and it is the one a European contributor
typed. So this is not a field we failed to read — the packet was scanned in
France and nobody has ever entered it in English or Malay.

Which sharpens option (5) rather than adding to the list: the capture loop would
fix the name and the panel in the same photograph, and it is still the only
thing on this page that can.
