/**
 * Rough 2026 Israeli market prices in ILS, ex-VAT, for the demo estimate.
 * Labor included unless noted. Calibrated against the site's planner price book
 * (lib/planner/price-book.seed.json: ~13,000 ILS/m2 all-in for planning + build)
 * and prices quoted in the platform's videos (rebar ~4,000 ILS/ton supply,
 * blocks ~1,000-1,250 ILS/m3, tiling labor 150-180 ILS/m2, aluminum pergola ~600-700 ILS/m base).
 */
export const PRICES = {
  concreteM3: 650, // B30 ready-mix delivered, no pump
  pumpDay: 3200, // boom pump, one pour day incl. setup
  rebarTon: 7500, // supply ~4,500 + cutting/bending/tying labor ~3,000
  formworkM2: 220, // plywood/steel forms incl. erection and stripping
  pileDrillingM: 450, // per running meter, 60 cm piles, incl. rig mobilization share
  excavationM3: 55, // excavation + loading + hauling (average site)
  blockWallM2: 330, // 20 cm block wall incl. labor, mortar
  plasterInteriorM2: 95, // three-coat interior plaster, labor + materials
  plasterExteriorM2: 135, // exterior render + colored finish (schlicht)
  stoneCladdingM2: 650, // natural stone cladding, supply + install
  roofWaterproofingM2: 140, // two-layer bitumen membrane, incl. upturns
  roofInsulationM2: 95, // insulation boards (XPS/EPS) over the roof
  screedM2: 85, // lightweight slope screed, average 8 cm
  porcelainFloorM2: 420, // porcelain tile 80x80: supply ~200 + laying ~160 + skirting
  wallTilesM2: 450, // bathroom wall tile, supply + install
  gypsumCeilingM2: 280, // dropped gypsum ceiling incl. framing and finishing
  aluminumWindowM2: 2300, // aluminum window/slider with double glazing
  interiorDoor: 3200, // interior door with frame, installed
  entryDoor: 12000, // security entry door, mid-range
  mamadDoorAndWindow: 22000, // certified blast door + blast window, installed
  kitchenLinearM: 9000, // kitchen per linear meter incl. counter, mid-range
  sanitarySet: 9000, // per bathroom: toilet, sink, shower set, mid-range
  paintM2: 38, // paint, per m2 of wall/ceiling, two coats incl. prep
  plumbingPoint: 900, // per water/drain point
  electricalPoint: 330, // per outlet/switch/light point, wiring included
  acSystemPerTon: 4800, // mini-central/ducted AC, installed, per ton
  solarHeater: 7500, // 150-200 L solar water heater with collector
  pavingM2: 380, // interlocking pavers on prepared base
  lawnM2: 90, // rolled lawn incl. soil prep and irrigation
  tree: 1500, // established tree, planted
  pergolaM2: 1400, // aluminum/steel pergola, installed
  stoneFenceM: 1600, // stone-faced fence, per running meter
  siteSetupLump: 45000, // fence, container, toilet, temporary power and water
  surveyLump: 9000, // surveyor: staking and levels (several visits)
  scaffoldingM2: 55, // facade scaffolding, rental + erection per m2
  sewerLump: 40000, // site sewer line to the street, manholes, sleeves
  retainingWaterproofM2: 150, // bitumen coat + protection board on retaining walls
  slabFormworkM2: 260, // slab deck formwork with props, per m2 of slab
  glassRailingM: 2200, // glass railing, per running meter
  deckM2: 900, // composite/wood deck, installed
  lightingFixture: 600, // average light fixture, supply only
  blindFrame: 450, // galvanized blind frame per opening, installed
} as const;
