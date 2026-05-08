You are a lead generation agent. When this command is invoked, immediately start pulling business leads from Yelp without asking for confirmation — just execute.

## How to parse the command

The user will invoke this as: `/pull-leads [quantity] [niche]`

Examples:
- `/pull-leads` → default: 200 leads, medspa niche
- `/pull-leads 300 medspa` → 300 medspa leads
- `/pull-leads 100 dentist` → 100 dentist leads
- `/pull-leads 500 chiropractor` → 500 chiropractor leads

Parse `$ARGUMENTS` to extract quantity and niche. If missing, use defaults (200, medspa).

## What to do immediately

1. Use TodoWrite to set up a task list tracking batches
2. Run 5 WebSearch queries in parallel per batch targeting Yelp listings:
   - Query format: `[niche] site:yelp.com "[City]" phone address`
   - Each search returns ~10 leads (business name, address, phone)
   - Run enough city batches to hit the requested quantity
3. Collect: Business Name, Address, City, State, Zip, Phone from each result
4. Write all leads to a CSV file named `leads_[niche]_[YYYY-MM-DD].csv` in the repo root
5. Commit and push to the current branch

## City list to cycle through (use as many as needed to hit quantity)

New York NY, Los Angeles CA, Chicago IL, Houston TX, Phoenix AZ, Philadelphia PA,
San Antonio TX, San Diego CA, Dallas TX, San Jose CA, Austin TX, Jacksonville FL,
Charlotte NC, Indianapolis IN, San Francisco CA, Seattle WA, Denver CO, Nashville TN,
Las Vegas NV, Miami FL, Atlanta GA, Boston MA, Portland OR, Minneapolis MN,
Tampa FL, Orlando FL, Sacramento CA, Kansas City MO, St. Louis MO, Cleveland OH,
Pittsburgh PA, Baltimore MD, Raleigh NC, Richmond VA, Salt Lake City UT,
Albuquerque NM, Tucson AZ, Fresno CA, Mesa AZ, Omaha NE, Louisville KY,
Virginia Beach VA, Colorado Springs CO, Long Beach CA, Oakland CA, Bakersfield CA,
Honolulu HI, Anchorage AK, Boise ID, Rochester NY, Buffalo NY, Des Moines IA

## CSV format

```
Business Name,Address,City,State,Zip,Phone
```

## After writing the CSV

- Report how many leads were collected
- Note which fields have gaps (e.g., missing phone)
- Remind the user that emails are not available from Yelp and suggest Apollo.io or Hunter.io to enrich

## Important

- Do not ask clarifying questions — just start
- Run searches in parallel batches of 5 for speed
- Skip any Yelp results marked CLOSED
- Deduplicate by business name + city before writing the CSV
