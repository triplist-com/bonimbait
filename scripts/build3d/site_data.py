"""Site, outdoor works, fixtures and terrain rules for plot 43 (read from the plan sheet).

Coordinates are page points of the ENTRANCE (left) viewport unless a record says 'lower'
(then they are right-viewport points; extract.py shifts them by VIEWPORT_DX).
"""
from __future__ import annotations

import math

import numpy as np

ZERO_ABS = 271.50  # "±0.00 = 271.50 פני ריצוף" (requested; the old datum 271.00 is the "נתון" value)
PI = math.pi

# ---------------------------------------------------------------------------------------
# Footprints (outer wall faces)
# ---------------------------------------------------------------------------------------
ENTRANCE_FOOTPRINT = [  # includes the recessed entry porch, excludes the terrace
    (422.92, 562.76), (564.64, 562.76), (564.64, 647.84), (726.16, 647.84), (726.16, 888.80),
    (703.48, 888.80), (703.48, 1013.48), (561.76, 1013.48), (561.76, 1044.68), (422.92, 1044.68),
    (422.92, 945.44), (425.68, 945.44), (425.68, 781.04), (422.92, 781.04),
]
LOWER_FOOTPRINT = [  # right-viewport points
    (1219.12, 568.52), (1321.12, 568.52), (1321.12, 574.16), (1511.08, 574.16), (1511.08, 786.56),
    (1357.96, 786.56), (1357.96, 812.24), (1250.32, 812.24), (1250.32, 840.56), (1210.60, 840.56),
    (1210.60, 772.52), (1219.12, 772.52),
]
# Everything north of the lower-floor retaining walls (outer faces) -> entrance slab is suspended
SUSPENDED_ZONE = [
    (300, 400), (900, 400), (900, 786.56), (573.16, 786.56), (573.16, 812.24), (465.52, 812.24),
    (465.52, 840.56), (300, 840.56),
]
TERRACE_SLAB = [(564.64, 562.76), (740.32, 562.76), (740.32, 653.48), (726.16, 653.48), (726.16, 647.84),
                (564.64, 647.84)]
INFERRED_COLUMNS: list = []  # the drawing shows its columns (blue stubs); none inferred

# ---------------------------------------------------------------------------------------
# Elevations
# ---------------------------------------------------------------------------------------
# Spot elevations written relative to ±0.00: (x, y, rel, abs or None, viewport)
SPOTS = [
    (673.9, 475.5, -3.27, 268.23, 'entrance'),   # back garden
    (364.9, 516.5, -3.27, 268.23, 'entrance'),
    (1339.5, 556.5, -3.27, 268.23, 'lower'),     # garden at the lower-floor facade
    (321.3, 672.6, -3.27, 268.23, 'entrance'),   # foot of the west garden stair
    (371.0, 705.7, -3.45, 268.05, 'entrance'),   # inspection chamber 5 cover
    (371.2, 758.6, -1.54, None, 'entrance'),     # west side yard
    (322.5, 780.1, -1.74, 269.76, 'entrance'),   # landing of the west garden stair
    (768.8, 735.2, -2.83, None, 'entrance'),     # planter "אדנית" east
    (654.5, 565.3, 0.20, None, 'entrance'),      # terrace curb
    (738.3, 620.2, 0.20, None, 'entrance'),      # terrace curb (east)
    (647.5, 621.8, -0.02, 271.48, 'entrance'),   # terrace "מרפסת"
    (779.7, 812.9, 0.20, None, 'entrance'),      # top of east retaining wall ("קו דירוג")
    (388.0, 830.6, 0.20, None, 'entrance'),      # top of west retaining wall
    (501.9, 850.0, 0.00, 271.50, 'entrance'),    # entrance floor "פני ריצוף"
    (330.7, 877.5, -0.02, 271.48, 'entrance'),   # paved path at the top of the west stair
    (393.9, 901.6, -0.20, 271.30, 'entrance'),   # inspection chamber 6
    (815.0, 827.0, -0.20, 271.30, 'entrance'),   # inspection chamber 1
    (816.9, 887.4, 1.20, None, 'entrance'),      # raised planter east
    (811.1, 1000.3, 1.20, None, 'entrance'),     # raised planter east
    (708.9, 970.8, -0.02, 271.48, 'entrance'),   # east path
    (363.3, 1043.5, 0.85, None, 'entrance'),     # top of railing wall at the parking steps
    (325.6, 1055.1, 0.63, 272.13, 'entrance'),   # parking (house side)
    (698.7, 1132.3, -0.02, 271.48, 'entrance'),  # south path
    (492.1, 1190.7, 0.46, 271.96, 'entrance'),   # parking at the street
    (325.6, 1197.1, 0.60, 272.10, 'entrance'),   # parking at the street
    (1542.7, 437.4, -3.45, 268.05, 'lower'),     # inspection chamber 3
    (1128.1, 445.1, -3.70, 267.80, 'lower'),     # inspection chamber 4
    (1568.5, 686.3, -3.45, 268.05, 'lower'),     # inspection chamber 2
]
# Absolute survey points on / near the lot boundary (natural ground or existing wall tops)
SURVEY = [
    (309.6, 421.0, 269.77, 'NW corner "ר.ק"'),
    (523.3, 421.0, 268.24, 'north wall top "ר.קיר"'),
    (810.7, 417.3, 268.24, 'north wall top'),
    (869.1, 423.5, 268.24, 'NE corner'),
    (868.1, 465.6, 268.24, 'east boundary'),
    (848.9, 709.7, 268.24, 'east boundary'),
    (856.2, 849.1, 271.12, 'east boundary'),
    (827.1, 1110.4, 271.12, 'east boundary'),
    (808.9, 1163.7, 272.18, 'SE corner'),
    (661.8, 1166.1, 272.18, 'south boundary'),
    (526.5, 1189.1, 272.18, 'south boundary'),
    (520.4, 1092.0, 272.24, '"קיים בשטח" (existing, in the field)'),
    (306.1, 1167.7, 272.58, 'SW corner'),
    (306.1, 893.4, 272.58, 'west boundary'),
    (306.1, 773.1, 269.88, 'west boundary'),
]
# Far-field guide points for the natural terrain outside the lot, from the contour labels on
# the neighbouring lots (265-271) - approximate, only to give the margin a believable slope.
# Interior guide points for the natural ground: the back garden keeps (about) its natural level and
# the west side-yard / garden-stair landing follow the west boundary survey (269.88).
NATURAL_GUIDES = [
    (673.9, 475.5, 268.30), (364.9, 516.5, 268.40), (500.0, 600.0, 268.40), (650.0, 650.0, 268.40),
    (371.2, 758.6, 269.90), (760.0, 735.0, 268.60),
]
FAR_FIELD = [
    (330, 372, 266.6), (550, 372, 266.2), (800, 372, 265.8),
    (240, 640, 269.0), (240, 850, 270.0), (240, 1045, 271.0), (240, 1230, 271.9),
    (930, 740, 267.0), (930, 990, 269.0), (930, 1180, 271.6),
    (450, 1250, 272.4), (700, 1225, 272.2),
]

NORTH_ANGLE = math.atan2(293.80 - 206.68, 1305.68 - 1237.40)  # north arrow, from drawing-up toward +X
NEIGHBORS = [('מגרש 42', 247.0, 919.0), ('מגרש 44', 899.0, 912.0)]

OVERLAY_ELEVATIONS = [
    ('entrance', 501.9, 850.0, '±0.00 (271.50)'),
    ('entrance', 647.5, 621.8, '-0.02 (271.48)'),
    ('entrance', 673.9, 475.5, '-3.27 (268.23)'),
    ('entrance', 322.5, 780.1, '-1.74 (269.76)'),
    ('entrance', 325.6, 1197.1, '+0.60 (272.10)'),
    ('entrance', 492.1, 1190.7, '+0.46 (271.96)'),
    ('entrance', 698.7, 1132.3, '-0.02 (271.48)'),
    ('entrance', 306.1, 893.4, '272.58'),
    ('entrance', 848.9, 709.7, '268.24'),
    ('lower', 1328.9, 690.1, '-3.25 (268.25)'),
    ('lower', 1339.5, 556.5, '-3.27 (268.23)'),
]

# ---------------------------------------------------------------------------------------
# Outdoor areas: (id, kind, nameHe, viewport, polygon, finished y)
# For 'pergola' y is the top of the pergola; for 'steps' y is the top of the flight.
# ---------------------------------------------------------------------------------------
OUTDOOR = [
    ('O-PATIO-N', 'path', 'שביל מרוצף', 'entrance',
     [(311.2, 448.8), (726.0, 448.8), (726.0, 568.5), (434.3, 568.5), (434.3, 683.0), (311.2, 683.0)], -3.27),
    ('O-GARDEN-N', 'garden', 'גינה', 'entrance',
     [(305.0, 418.0), (875.0, 418.0), (875.0, 448.8), (305.0, 448.8)], -3.27),
    ('O-LAWN-E', 'lawn', 'מדשאה', 'entrance',
     [(726.3, 448.8), (880.0, 448.8), (880.0, 736.8), (726.3, 736.8)], -3.27),
    ('O-PLANTER-E', 'planter', 'אדנית', 'entrance',
     [(726.3, 736.8), (835.2, 736.8), (835.2, 795.9), (726.3, 795.9)], -2.83),
    ('O-SIDE-W', 'garden', None, 'entrance',
     [(351.6, 683.0), (434.3, 683.0), (434.3, 772.5), (425.8, 772.5), (425.8, 826.4), (351.6, 826.4)], -1.54),
    ('O-STEPS-W1', 'steps', 'מדרגות לגינה', 'entrance',
     [(311.2, 684.1), (345.9, 684.1), (345.9, 752.1), (311.2, 752.1)], -1.74),
    ('O-LANDING-W', 'path', None, 'entrance',
     [(311.2, 752.1), (345.9, 752.1), (345.9, 786.2), (311.2, 786.2)], -1.74),
    ('O-STEPS-W2', 'steps', 'מדרגות לגינה', 'entrance',
     [(311.2, 786.2), (345.9, 786.2), (345.9, 862.6), (311.2, 862.6)], -0.02),
    ('O-PATH-W', 'path', 'שביל מרוצף', 'entrance',
     [(311.2, 862.6), (351.6, 862.6), (351.6, 836.0), (425.7, 836.0), (425.7, 900.1), (345.9, 900.1),
      (345.9, 976.7), (311.2, 976.7)], -0.02),
    ('O-YARD-W', 'garden', None, 'entrance',
     [(345.9, 900.1), (425.7, 900.1), (425.7, 1044.7), (345.9, 1044.7)], -0.10),
    ('O-STEPS-P', 'steps', 'מדרגות לחניה', 'entrance',
     [(311.2, 976.7), (347.9, 976.7), (347.9, 1047.0), (311.2, 1047.0)], 0.63),
    ('O-PARKING', 'parking', 'חניה', 'entrance',
     [(305.0, 1047.0), (521.0, 1047.0), (521.0, 1215.0), (305.0, 1215.0)], 0.55),
    ('O-PATH-E', 'path', 'שביל מרוצף', 'entrance',
     [(726.2, 801.7), (794.0, 801.7), (794.0, 886.4), (845.0, 886.4), (845.0, 998.4), (806.0, 998.4),
      (806.0, 1041.8), (703.5, 1041.8), (703.5, 888.8), (726.2, 888.8)], -0.02),
    ('O-PATH-S', 'path', 'שביל מרוצף', 'entrance',
     [(521.0, 1044.7), (561.8, 1044.7), (561.8, 1013.5), (703.5, 1013.5), (703.5, 1041.8), (845.0, 1041.8),
      (845.0, 1215.0), (521.0, 1215.0)], -0.02),
    ('O-PLANTER-E1', 'planter', 'אדנית', 'entrance',
     [(794.0, 801.7), (850.0, 801.7), (850.0, 886.4), (794.0, 886.4)], 1.20),
    ('O-PLANTER-E2', 'planter', 'אדנית', 'entrance',
     [(806.0, 998.4), (850.0, 998.4), (850.0, 1170.0), (806.0, 1170.0)], 1.20),
    ('O-PERGOLA', 'pergola', 'פרגולה קלה', 'entrance',
     [(726.2, 801.6), (802.8, 801.6), (802.8, 1041.8), (561.8, 1041.8), (561.8, 1013.5), (703.5, 1013.5),
      (703.5, 888.8), (726.2, 888.8)], 2.60),
]

# ---------------------------------------------------------------------------------------
# Fixtures: (id, level, kind, viewport, cx, cy, sizeX, sizeZ, rotation, y)
# size = [width, depth] in the fixture's local frame; local -Z is its back (headboard, wall
# side), local +Z its front. rotation is about +Y (three.js): local +Z -> (sin r, cos r).
#   front toward +Z (south) r=0 | toward -Z (north) r=PI | toward +X (east) r=PI/2 | toward -X r=-PI/2
# ---------------------------------------------------------------------------------------
H = PI / 2
FIXTURES = [
    # entrance floor
    ('F-E-BED', 'entrance', 'bed-double', 'entrance', 456.4, 617.0, 1.62, 1.89, H, None),
    ('F-E-TV1', 'entrance', 'tv', 'entrance', 557.3, 612.6, 1.10, 0.08, -H, None),
    ('F-E-WARD1', 'entrance', 'wardrobe', 'entrance', 475.4, 676.1, 3.30, 0.58, 0.0, None),
    ('F-E-WARD2', 'entrance', 'wardrobe', 'entrance', 567.5, 706.0, 3.50, 0.60, -H, None),
    ('F-E-MB-WC', 'entrance', 'toilet', 'entrance', 436.5, 740.3, 0.40, 0.65, H, None),
    ('F-E-MB-SINK', 'entrance', 'sink', 'entrance', 464.5, 769.0, 0.80, 0.50, PI, None),
    ('F-E-MB-SHOWER', 'entrance', 'shower', 'entrance', 509.9, 751.3, 0.85, 1.70, 0.0, None),
    ('F-E-SOFA', 'entrance', 'sofa', 'entrance', 701.9, 734.9, 2.90, 0.90, -H, None),
    ('F-E-ARM1', 'entrance', 'armchair', 'entrance', 617.8, 678.1, 0.85, 0.85, 0.30, None),
    ('F-E-ARM2', 'entrance', 'armchair', 'entrance', 658.2, 678.1, 0.85, 0.85, -0.30, None),
    ('F-E-COFFEE', 'entrance', 'coffee-table', 'entrance', 635.3, 736.4, 1.00, 1.50, 0.0, None),
    ('F-E-TV2', 'entrance', 'tv', 'entrance', 583.5, 716.3, 1.30, 0.08, H, None),
    ('F-E-DINING', 'entrance', 'dining-table', 'entrance', 665.3, 840.0, 2.15, 1.40, 0.0, None),
    ('F-E-ISLAND', 'entrance', 'kitchen-island', 'entrance', 629.0, 919.1, 1.21, 2.58, 0.0, None),
    ('F-E-COUNTER-S', 'entrance', 'kitchen-counter', 'entrance', 638.3, 998.7, 4.20, 0.65, PI, None),
    ('F-E-COUNTER-E', 'entrance', 'kitchen-counter', 'entrance', 688.8, 921.9, 2.77, 0.65, -H, None),
    ('F-E-PANTRY', 'entrance', 'kitchen-counter', 'entrance', 568.8, 958.2, 3.50, 0.65, H, None),
    ('F-E-WASHER', 'entrance', 'washer', 'entrance', 565.5, 895.3, 0.60, 0.60, -H, None),
    ('F-E-GB-WC', 'entrance', 'toilet', 'entrance', 469.0, 911.0, 0.40, 0.65, 0.0, None),
    ('F-E-GB-SINK', 'entrance', 'sink', 'entrance', 499.0, 907.0, 0.60, 0.45, 0.0, None),
    ('F-E-GB-SHOWER', 'entrance', 'shower', 'entrance', 443.6, 922.8, 0.85, 1.60, 0.0, None),
    # lower floor (right viewport points)
    ('F-L-BED1', 'lower', 'bed-single', 'lower', 1243.5, 602.8, 1.27, 2.00, 0.0, None),
    ('F-L-DESK1', 'lower', 'desk', 'lower', 1306.3, 603.3, 1.96, 0.54, -H, None),
    ('F-L-WARD1', 'lower', 'wardrobe', 'lower', 1256.0, 667.7, 2.15, 0.58, PI, None),
    ('F-L-SOFA', 'lower', 'sofa', 'lower', 1373.3, 625.7, 2.15, 0.81, -H, None),
    ('F-L-BED2', 'lower', 'bed-single', 'lower', 1476.3, 598.4, 1.31, 2.00, -H, None),
    ('F-L-DESK2', 'lower', 'desk', 'lower', 1398.4, 599.5, 1.39, 0.58, H, None),
    ('F-L-WARD2', 'lower', 'wardrobe', 'lower', 1466.5, 655.7, 2.69, 0.58, PI, None),
    ('F-L-BED3', 'lower', 'bed-single', 'lower', 1486.8, 752.5, 1.27, 1.98, PI, None),
    ('F-L-DESK3', 'lower', 'desk', 'lower', 1485.4, 676.6, 1.37, 0.54, 0.0, None),
    ('F-L-WARD3', 'lower', 'wardrobe', 'lower', 1414.8, 743.8, 2.60, 0.58, H, None),
    ('F-L-B1-WC', 'lower', 'toilet', 'lower', 1264.5, 712.4, 0.40, 0.65, PI, None),
    ('F-L-B1-SINK', 'lower', 'sink', 'lower', 1299.3, 717.2, 1.00, 0.50, PI, None),
    ('F-L-B1-SHOWER', 'lower', 'shower', 'lower', 1237.5, 701.3, 0.87, 1.59, 0.0, None),
    ('F-L-WASHER', 'lower', 'washer', 'lower', 1289.7, 735.8, 0.57, 0.55, 0.0, None),
    ('F-L-DRYER', 'lower', 'washer', 'lower', 1306.2, 735.8, 0.57, 0.55, 0.0, None),
    ('F-L-LAUNDRY-SINK', 'lower', 'sink', 'lower', 1269.9, 735.5, 0.53, 0.40, 0.0, None),
    ('F-L-B2-WC', 'lower', 'toilet', 'lower', 1395.4, 736.8, 0.40, 0.65, -H, None),
    ('F-L-B2-SINK', 'lower', 'sink', 'lower', 1366.7, 773.5, 0.55, 0.40, PI, None),
    ('F-L-B2-SHOWER', 'lower', 'shower', 'lower', 1390.5, 765.3, 0.88, 1.08, 0.0, None),
    # site
    ('F-S-CAR1', 'site', 'car', 'entrance', 388.0, 1113.0, 1.65, 3.65, PI, 0.55),
    ('F-S-CAR2', 'site', 'car', 'entrance', 472.3, 1113.0, 1.65, 3.65, PI, 0.55),
    ('F-S-LC1', 'site', 'lounge-chair', 'entrance', 748.8, 813.0, 0.76, 0.72, 0.0, -0.02),
    ('F-S-LC2', 'site', 'lounge-chair', 'entrance', 771.6, 813.0, 0.76, 0.72, 0.0, -0.02),
    ('F-S-OTABLE1', 'site', 'outdoor-table', 'entrance', 759.6, 850.2, 0.60, 1.06, 0.0, -0.02),
    ('F-S-ARM1', 'site', 'armchair', 'entrance', 793.8, 839.9, 0.62, 0.76, -H, -0.02),
    ('F-S-ARM2', 'site', 'armchair', 'entrance', 793.8, 862.8, 0.62, 0.76, -H, -0.02),
    ('F-S-OTABLE2', 'site', 'outdoor-table', 'entrance', 757.8, 961.2, 0.95, 1.72, 0.0, -0.02),
    ('F-S-BBQ', 'site', 'kitchen-counter', 'entrance', 819.6, 942.0, 2.60, 0.60, -H, -0.02),
    ('F-S-G-ARM1', 'site', 'armchair', 'lower', 1393.4, 515.4, 0.85, 0.85, H, -3.27),
    ('F-S-G-TABLE', 'site', 'coffee-table', 'lower', 1429.9, 515.0, 0.90, 0.52, 0.0, -3.27),
    ('F-S-G-ARM2', 'site', 'armchair', 'lower', 1466.5, 515.4, 0.85, 0.85, -H, -3.27),
    ('F-S-G-LC1', 'site', 'lounge-chair', 'lower', 1413.7, 545.9, 0.85, 0.60, PI, -3.27),
    ('F-S-G-LC2', 'site', 'lounge-chair', 'lower', 1441.5, 545.9, 0.85, 0.60, PI, -3.27),
    ('F-S-TREE1', 'site', 'tree', 'entrance', 826.0, 785.8, 2.5, 2.5, 0.0, -2.83),
    ('F-S-TREE2', 'site', 'tree', 'entrance', 822.0, 1035.0, 1.6, 1.6, 0.0, 1.20),
    ('F-S-TREE3', 'site', 'tree', 'entrance', 820.0, 1090.0, 1.6, 1.6, 0.0, 1.20),
    ('F-S-TREE4', 'site', 'tree', 'entrance', 818.0, 1140.0, 1.6, 1.6, 0.0, 1.20),
    ('F-S-TREE5', 'site', 'tree', 'entrance', 822.0, 840.0, 1.6, 1.6, 0.0, 1.20),
]

ASSUMPTIONS = [
    'Lower floor finished level -3.25 (268.25, "מבוקש"); a stray label "-3.00 / 268.00" at the stair foot uses the old datum (±0.00 = 271.00 "נתון").',
    'Entrance floor ±0.00 = 271.50 (requested; the sheet note raises the old ±0.00 = 271.00 by 50 cm).',
    'Floor finishes 8 cm (tiles + mortar bed) over every structural slab.',
    'Lower floor: slab on grade 20 cm; clear height to the entrance slab 2.92 m.',
    'Entrance slab 25 cm: suspended over the lower floor, on grade (void formers) over the non-excavated hatched area.',
    'Roof slab top +3.30, 25 cm thick (clear height entrance floor 3.05 m); roof parapets 1.00 m (not drawn, assumed along the whole roof edge).',
    'Red solid hatch = blocks, blue solid hatch = reinforced concrete (mamad, retaining walls, column stubs).',
    'Wall thickness snapped to 5 cm from the hatch width (5.64-5.76 pt -> 0.20 m, 2.76-2.88 pt -> 0.10 m, 8.52 pt -> 0.30 m).',
    'Window sill 0.95 / head 2.20; shower windows 1.40-2.10; kitchen window 1.05-2.20 (counter); vitrines and sliding doors 0-2.40; doors 0-2.10; entry door 0-2.20; mamad door 0-2.00; mamad window 1.00-2.00.',
    'Terrace: finished -0.02 on a slab at -0.12 over the lower floor; the railing ("מעקה במידות עפ"י תקן") on a +0.20 curb is modelled as a 1.05 m parapet.',
    'Retaining walls of the lower floor: 20 cm concrete as drawn; site retaining walls topped at +0.20 (spot elevations next to them).',
    'Natural terrain: interpolated from the boundary survey points (268.24-272.58) plus approximate far-field points read from neighbouring contour labels.',
    'Finished terrain: garden/patio -3.27, west side yard -1.54, paths -0.02, parking +0.63 -> +0.46/+0.60 at the street, east raised planters +1.20, lower planter -2.83.',
    'Light pergola ("פרגולה קלה") top at +2.60 (not dimensioned in height).',
    'Furniture sizes are measured from the drawn symbols; the drawn cars are small (1.65 x 3.65 m).',
]


# ---------------------------------------------------------------------------------------
# Terrain
# ---------------------------------------------------------------------------------------
def natural_terrain(gx, gz, to_m):
    from scipy.interpolate import RBFInterpolator
    pts, vals = [], []
    for x, y, absv, _ in SURVEY:
        pts.append(to_m('entrance', x, y)); vals.append(absv - ZERO_ABS)
    for x, y, absv in FAR_FIELD + NATURAL_GUIDES:
        pts.append(to_m('entrance', x, y)); vals.append(absv - ZERO_ABS)
    # 'linear' polyharmonic kernel: no thin-plate overshoot across the old terrace step
    rbf = RBFInterpolator(np.array(pts, float), np.array(vals, float), kernel='linear', smoothing=0.05)
    X, Z = np.meshgrid(gx, gz)
    q = np.column_stack([X.ravel(), Z.ravel()])
    h = rbf(q).reshape(X.shape)
    return np.clip(h, -7.0, 2.0)


def _poly(to_m, pts, vp='entrance'):
    from shapely.geometry import Polygon
    from pdfplan import VIEWPORT_DX
    if vp == 'lower':
        pts = [(x - VIEWPORT_DX, y) for x, y in pts]
    return Polygon([to_m('entrance', x, y) for x, y in pts])


def finished_terrain(gx, gz, natural, to_m, lot):
    """Rule-based finished grade from the development plan (see ASSUMPTIONS)."""
    from shapely.geometry import Point
    from shapely.prepared import prep
    lower_p = _poly(to_m, LOWER_FOOTPRINT, 'lower').union(
        _poly(to_m, ENTRANCE_FOOTPRINT).intersection(_poly(to_m, SUSPENDED_ZONE)))
    lower = prep(lower_p.buffer(0.05))  # excavated under the whole suspended part (incl. overhangs)
    entr = prep(_poly(to_m, ENTRANCE_FOOTPRINT).buffer(0.05))
    lotp = prep(lot.buffer(0.3))
    zones = []
    for oid, kind, name, vp, pts, y in OUTDOOR:
        if kind == 'pergola':
            continue
        zones.append((oid, kind, prep(_poly(to_m, pts, vp)), y, pts))
    north = prep(_poly(to_m, [(290, 380), (900, 380), (900, 798.8), (700, 798.8), (700, 829.2), (349, 829.2),
                              (349, 865.6), (290, 865.6)]))

    def zm(y):  # page y -> model z
        return to_m('entrance', 0, y)[1]

    out = natural.copy()
    for r, z in enumerate(gz):
        for c, x in enumerate(gx):
            p = Point(x, z)
            if not lotp.contains(p):
                continue
            if lower.contains(p):
                out[r, c] = -3.33
                continue
            if entr.contains(p):
                out[r, c] = -0.10
                continue
            v = None
            for oid, kind, zp, y, pts in zones:
                if zp.contains(p):
                    if oid == 'O-STEPS-W1':
                        t = (z - zm(684.1)) / (zm(752.1) - zm(684.1)); v = -3.27 + 1.53 * min(max(t, 0), 1)
                    elif oid == 'O-STEPS-W2':
                        t = (z - zm(786.2)) / (zm(862.6) - zm(786.2)); v = -1.74 + 1.72 * min(max(t, 0), 1)
                    elif oid == 'O-STEPS-P':
                        t = (z - zm(976.7)) / (zm(1047.0) - zm(976.7)); v = -0.02 + 0.65 * min(max(t, 0), 1)
                    elif oid == 'O-PARKING':
                        t = (z - zm(1047.0)) / (zm(1200.0) - zm(1047.0)); v = 0.63 - 0.10 * min(max(t, 0), 1)
                    elif oid == 'O-SIDE-W':
                        t = (z - zm(700.0)) / (zm(758.0) - zm(700.0)); v = -3.40 + 1.86 * min(max(t, 0), 1)
                    elif oid == 'O-PATH-S':
                        t = (z - zm(1140.0)) / (zm(1168.0) - zm(1140.0)); v = -0.02 + 0.70 * min(max(t, 0), 1)
                    else:
                        v = y
                    break
            if v is None:
                v = -3.27 if north.contains(p) else -0.02
            out[r, c] = v
    return out


def street_polyline(lot_m):
    """Street centreline-ish polyline south of the lot: the south boundary pushed 3 m outward."""
    zs = [p[1] for p in lot_m]
    zmax = max(zs)
    south = [p for p in lot_m if p[1] > zmax - 2.5]
    south.sort(key=lambda p: p[0])
    pts = [[round(x, 3), round(z + 3.0, 3)] for x, z in south]
    a, b = pts[0], pts[-1]
    pts.insert(0, [round(a[0] - 8.0, 3), a[1]])
    pts.append([round(b[0] + 8.0, 3), b[1]])
    return pts
