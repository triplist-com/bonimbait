"""Curated reading of the plot-43 plan sheet (Home-Model.pdf).

Every coordinate below is in PDF page points of the viewport named in the record
('entrance' = left drawing, 'lower' = right drawing). Wall bands / spans were read from the
red / blue solid-hatch rectangles (see walls.py, `python walls.py` prints them); opening
spans are the gaps between hatch pieces; texts were read from 300-1200 DPI crops because the
PDF has no text layer (every glyph is vectorized).

Conventions
  H wall: band = (y0, y1) page pts, span = (x0, x1)    V wall: band = (x0, x1), span = (y0, y1)
  openings: (lo, hi, kind[, sill, head]) along the wall span axis.
"""

# --------------------------------------------------------------------------------------
# Walls
# --------------------------------------------------------------------------------------
# (id, vp, orient, band, span, material, role, openings)
WALLS = [
    # ---------------- entrance floor (±0.00) : exterior blocks 20 cm ----------------
    ('E-N1', 'entrance', 'H', (562.76, 568.52), (434.20, 553.24), 'block', 'exterior',
     [(459.76, 510.76, 'vitrine')]),  # master bedroom, full-height glazing + "מעקה תקני"
    ('E-W1', 'entrance', 'V', (422.92, 428.56), (568.52, 721.52), 'block', 'exterior',
     [(568.52, 585.44, 'window'), (647.84, 664.88, 'window'), (687.56, 721.52, 'window')]),
    ('E-W2', 'entrance', 'V', (422.92, 428.56), (732.92, 775.40), 'block', 'exterior',
     [(732.92, 749.84, 'window', 1.40, 2.10)]),  # master shower, high window
    ('E-W3', 'entrance', 'V', (425.68, 431.44), (781.04, 834.92), 'block', 'exterior',
     [(793.76, 819.32, 'window')]),  # stair window
    ('E-PN', 'entrance', 'H', (834.92, 840.56), (437.08, 476.80), 'block', 'exterior', []),
    ('E-PE', 'entrance', 'V', (471.16, 476.80), (840.56, 894.44), 'block', 'exterior',
     [(846.20, 880.28, 'entry-door')]),
    ('E-PS', 'entrance', 'H', (894.44, 900.08), (437.08, 476.80), 'block', 'exterior', []),
    ('E-W4', 'entrance', 'V', (425.68, 431.44), (900.08, 945.44), 'block', 'exterior',
     [(925.64, 942.68, 'window', 1.40, 2.10)]),  # guest shower
    ('E-E1', 'entrance', 'V', (559.00, 564.64), (568.52, 647.84), 'block', 'exterior', []),
    ('E-SN', 'entrance', 'H', (647.84, 656.36), (587.32, 703.60), 'concrete', 'exterior',
     [(587.32, 703.60, 'vitrine')]),  # living room -> terrace, 4.10 m between two concrete stubs
    ('E-SE', 'entrance', 'V', (720.52, 726.16), (656.36, 871.76), 'block', 'exterior',
     [(817.88, 871.76, 'sliding-door')]),  # dining -> east paved path (-0.02)
    ('E-KNE', 'entrance', 'H', (883.16, 888.80), (703.48, 720.52), 'block', 'exterior', []),
    ('E-KE', 'entrance', 'V', (697.84, 703.48), (891.56, 1007.84), 'block', 'exterior',
     [(891.56, 914.24, 'window'), (963.92, 986.60, 'door')]),
    ('E-KS', 'entrance', 'H', (1007.84, 1013.48), (561.76, 692.20), 'block', 'exterior',
     [(599.32, 658.84, 'window', 1.05, 2.20)]),  # over the sink counter
    # ---------------- entrance floor : ממ"ד (reinforced concrete) ----------------
    ('E-MN', 'entrance', 'H', (945.44, 951.08), (422.92, 553.24), 'concrete', 'mamad',
     [(524.92, 547.60, 'mamad-door')]),
    ('E-MW', 'entrance', 'V', (422.92, 431.44), (951.08, 1036.16), 'concrete', 'mamad',
     [(979.52, 1007.84, 'mamad-window')]),
    ('E-MS', 'entrance', 'H', (1036.16, 1044.68), (422.92, 561.76), 'concrete', 'mamad', []),
    ('E-ME1', 'entrance', 'V', (553.24, 559.00), (951.08, 1007.84), 'concrete', 'mamad', []),
    ('E-ME2', 'entrance', 'V', (553.24, 561.76), (1007.84, 1036.16), 'concrete', 'mamad', []),
    # ---------------- entrance floor : interior ----------------
    ('E-I1', 'entrance', 'H', (664.88, 667.64), (428.56, 525.04), 'block', 'interior', []),
    ('E-I2', 'entrance', 'H', (724.40, 727.16), (428.56, 522.16), 'block', 'interior',
     [(466.00, 488.68, 'door')]),
    ('E-I3', 'entrance', 'V', (522.16, 525.04), (667.64, 775.40), 'block', 'interior',
     [(687.56, 710.24, 'opening')]),  # walk-in closet entrance (no leaf drawn)
    ('E-I4', 'entrance', 'H', (775.40, 778.28), (431.44, 559.00), 'block', 'interior',
     [(529.84, 555.28, 'door')]),  # master suite door
    ('E-I5', 'entrance', 'V', (575.92, 578.80), (656.36, 755.60), 'block', 'interior', []),
    ('E-SHN', 'entrance', 'H', (755.60, 758.36), (559.00, 578.80), 'block', 'interior', []),
    ('E-SHW', 'entrance', 'V', (559.00, 561.76), (758.36, 803.72), 'block', 'interior', []),
    ('E-SHE', 'entrance', 'V', (575.92, 578.80), (758.36, 803.72), 'block', 'interior', []),
    ('E-SHS', 'entrance', 'H', (803.72, 806.60), (559.00, 578.80), 'block', 'interior', []),
    ('E-I7', 'entrance', 'V', (516.40, 519.28), (883.16, 945.44), 'block', 'interior',
     [(920.00, 942.68, 'door')]),  # guest shower door
    ('E-I8', 'entrance', 'H', (897.32, 900.08), (476.80, 516.40), 'block', 'interior', []),
    ('E-I9', 'entrance', 'H', (883.16, 885.92), (553.24, 573.16), 'block', 'interior', []),
    ('E-I10', 'entrance', 'H', (905.72, 908.60), (559.00, 573.16), 'block', 'interior', []),
    ('E-I11', 'entrance', 'V', (553.24, 559.00), (905.72, 951.08), 'concrete', 'interior', []),
    # terrace railing on a +0.20 curb ("מעקה במידות עפ\"י תקן")
    ('E-TRN', 'entrance', 'H', (562.76, 568.52), (564.64, 740.32), 'concrete', 'parapet', []),
    ('E-TRE', 'entrance', 'V', (734.68, 740.32), (568.52, 653.48), 'concrete', 'parapet', []),

    # ---------------- lower floor (-3.25) : exterior ----------------
    ('L-N1', 'lower', 'H', (568.52, 574.16), (1224.76, 1315.48), 'block', 'exterior',
     [(1250.32, 1289.92, 'window')]),
    ('L-N2', 'lower', 'H', (574.16, 579.80), (1324.00, 1380.64), 'concrete', 'exterior',
     [(1324.00, 1380.64, 'sliding-door')]),  # family area -> garden
    ('L-N3', 'lower', 'H', (574.16, 579.80), (1392.04, 1505.32), 'block', 'exterior',
     [(1421.80, 1461.40, 'window')]),
    ('L-W1', 'lower', 'V', (1219.12, 1224.76), (579.80, 673.40), 'block', 'exterior', []),
    ('L-W2', 'lower', 'V', (1219.12, 1224.76), (684.68, 772.52), 'block', 'exterior',
     [(684.68, 701.72, 'window', 1.40, 2.10), (744.20, 769.76, 'door')]),  # laundry -> side yard
    ('L-W3', 'lower', 'V', (1210.60, 1216.24), (778.28, 834.92), 'block', 'exterior',
     [(793.76, 819.32, 'window', 1.60, 2.40)]),  # stair window (landing height)
    ('L-E1', 'lower', 'V', (1505.32, 1511.08), (585.44, 780.92), 'block', 'exterior',
     [(684.56, 724.28, 'window')]),
    # ---------------- lower floor : retaining walls (concrete, against the slope) ----------------
    ('L-R1', 'lower', 'H', (780.92, 786.56), (1352.32, 1511.08), 'concrete', 'retaining', []),
    ('L-R2', 'lower', 'V', (1352.32, 1357.96), (786.56, 806.60), 'concrete', 'retaining', []),
    ('L-R3', 'lower', 'H', (806.60, 812.24), (1244.56, 1357.96), 'concrete', 'retaining', []),
    ('L-R4', 'lower', 'V', (1244.56, 1250.32), (812.24, 834.92), 'concrete', 'retaining', []),
    ('L-R5', 'lower', 'H', (834.92, 840.56), (1210.60, 1250.32), 'concrete', 'retaining', []),
    ('L-R6', 'lower', 'V', (1505.32, 1511.08), (786.56, 795.92), 'concrete', 'retaining', []),
    # ---------------- lower floor : interior ----------------
    ('L-I1', 'lower', 'H', (676.16, 679.04), (1224.76, 1315.48), 'block', 'interior', []),
    ('L-I2', 'lower', 'V', (1315.48, 1318.36), (579.80, 775.40), 'block', 'interior',
     [(647.84, 673.40, 'door'), (681.80, 704.48, 'door'), (747.08, 772.52, 'door')]),
    ('L-I3', 'lower', 'H', (724.40, 727.16), (1224.76, 1315.48), 'block', 'interior', []),
    ('L-I4', 'lower', 'H', (775.40, 778.28), (1224.76, 1318.36), 'block', 'interior', []),
    ('L-I5', 'lower', 'V', (1386.28, 1389.16), (579.80, 667.52), 'block', 'interior', []),
    ('L-I6', 'lower', 'H', (664.76, 667.52), (1389.16, 1505.32), 'block', 'interior',
     [(1392.04, 1417.48, 'door')]),
    ('L-I7', 'lower', 'V', (1420.36, 1423.12), (667.52, 704.36), 'block', 'interior',
     [(671.84, 697.28, 'door')]),
    ('L-I8', 'lower', 'H', (704.36, 707.24), (1355.20, 1423.12), 'block', 'interior', []),
    ('L-I9', 'lower', 'V', (1403.32, 1406.20), (707.24, 780.92), 'block', 'interior', []),
    ('L-I10', 'lower', 'H', (721.40, 724.28), (1355.20, 1403.32), 'block', 'interior', []),
    ('L-I11', 'lower', 'V', (1352.32, 1355.20), (704.36, 780.92), 'block', 'interior',
     [(724.28, 749.72, 'door')]),

    # ---------------- site retaining walls (drawn on the lower plan, blue) ----------------
    ('S-E1', 'lower', 'H', (795.92, 801.68), (1511.08, 1626.52), 'concrete', 'site-retaining', []),
    ('S-W1', 'lower', 'H', (826.40, 832.04), (1130.80, 1210.60), 'concrete', 'site-retaining', []),
    ('S-W2', 'lower', 'V', (1130.80, 1136.44), (832.04, 862.76), 'concrete', 'site-retaining', []),
    ('S-W3', 'lower', 'H', (862.76, 868.40), (1096.72, 1136.44), 'concrete', 'site-retaining', []),
]

# Concrete stubs inside block walls (blue hatch) -> columns.  (id, vp, x0, y0, x1, y1)
COLUMNS = [
    ('C-E1', 'entrance', 422.92, 562.76, 434.20, 568.52),
    ('C-E2', 'entrance', 553.24, 562.76, 564.64, 568.52),
    ('C-E3', 'entrance', 422.92, 721.52, 428.56, 732.92),
    ('C-E4', 'entrance', 422.92, 775.40, 431.44, 781.04),
    ('C-E5', 'entrance', 425.68, 834.92, 437.08, 840.56),
    ('C-E6', 'entrance', 425.68, 894.44, 437.08, 900.08),
    ('C-E7', 'entrance', 559.00, 647.84, 587.32, 656.36),
    ('C-E8', 'entrance', 703.60, 647.84, 726.16, 656.36),
    ('C-E9', 'entrance', 720.52, 871.76, 726.28, 888.80),
    ('C-E10', 'entrance', 697.84, 883.16, 703.48, 891.56),
    ('C-E11', 'entrance', 692.20, 1007.84, 703.48, 1013.48),
    ('C-E12', 'entrance', 573.16, 883.16, 578.80, 908.60),
    ('C-L1', 'lower', 1219.12, 568.52, 1224.76, 579.80),
    ('C-L2', 'lower', 1315.48, 568.52, 1324.00, 579.80),  # L-shaped stub, bbox
    ('C-L3', 'lower', 1380.64, 574.16, 1392.04, 579.80),
    ('C-L4', 'lower', 1505.32, 574.16, 1511.08, 585.44),
    ('C-L5', 'lower', 1219.12, 673.40, 1224.76, 684.68),
    ('C-L6', 'lower', 1210.60, 772.52, 1224.76, 778.28),
]

# --------------------------------------------------------------------------------------
# Rooms: (id, vp, nameHe, kind, polygon page pts, label point page pts or None, dimsLabel, named_on_plan)
# --------------------------------------------------------------------------------------
ROOMS = [
    ('R-E-MASTER', 'entrance', 'ח.שינה הורים', 'master',
     [(428.56, 568.52), (559.00, 568.52), (559.00, 664.88), (428.56, 664.88)], (514.5, 637.0), '460/340', True),
    ('R-E-CLOSET', 'entrance', 'ח.ארונות הורים', 'closet',
     [(428.56, 667.64), (522.16, 667.64), (522.16, 724.40), (428.56, 724.40)], (478.0, 698.0), '330/200', True),
    ('R-E-MBATH', 'entrance', 'מקלחת הורים', 'bath',
     [(428.56, 727.16), (522.16, 727.16), (522.16, 775.40), (428.56, 775.40)], (466.0, 752.0), '330/170', True),
    ('R-E-PASS', 'entrance', 'מעבר', 'hall',
     [(525.04, 664.88), (559.00, 664.88), (559.00, 656.36), (575.92, 656.36), (575.92, 755.60),
      (559.00, 755.60), (559.00, 775.40), (525.04, 775.40)], None, '122', False),
    ('R-E-TERRACE', 'entrance', 'מרפסת', 'terrace',
     [(564.64, 568.52), (734.68, 568.52), (734.68, 647.84), (564.64, 647.84)], (649.0, 606.0), '560/280', True),
    ('R-E-LIVING', 'entrance', 'סלון', 'living',
     [(578.80, 656.36), (720.52, 656.36), (720.52, 806.60), (578.80, 806.60)], (630.0, 745.0), '500/800', True),
    ('R-E-DINING', 'entrance', 'פ.אוכל', 'dining',
     [(559.00, 806.60), (720.52, 806.60), (720.52, 883.16), (559.00, 883.16)], (667.0, 840.0), '860/270', True),
    ('R-E-KITCHEN', 'entrance', 'מטבח', 'kitchen',
     [(578.80, 883.16), (697.84, 883.16), (697.84, 1007.84), (559.00, 1007.84), (559.00, 908.60),
      (578.80, 908.60)], (630.5, 966.0), '490/440', True),
    ('R-E-HALL', 'entrance', 'מבואה', 'hall',
     [(476.80, 834.92), (559.00, 834.92), (559.00, 883.16), (553.24, 883.16), (553.24, 945.44),
      (519.28, 945.44), (519.28, 883.16), (476.80, 883.16)], None, None, False),
    ('R-E-ENTRY', 'entrance', 'כניסה', 'entry',
     [(431.44, 840.56), (471.16, 840.56), (471.16, 894.44), (431.44, 894.44)], (447.0, 871.0), '160/190', True),
    ('R-E-GBATH', 'entrance', 'מקלחת', 'bath',
     [(431.44, 900.08), (516.40, 900.08), (516.40, 945.44), (431.44, 945.44)], (474.0, 937.0), '300/160', True),
    ('R-E-MAMAD', 'entrance', 'ממ"ד', 'mamad',
     [(431.44, 951.08), (553.24, 951.08), (553.24, 1036.16), (431.44, 1036.16)], (492.0, 998.0), '430/300', True),

    ('R-L-BED1', 'lower', 'ח.שינה', 'bedroom',
     [(1224.76, 574.16), (1315.48, 574.16), (1315.48, 676.16), (1224.76, 676.16)], (1263.0, 610.0), '320/360', True),
    ('R-L-BATH1', 'lower', 'מקלחת', 'bath',
     [(1224.76, 679.04), (1315.48, 679.04), (1315.48, 724.40), (1224.76, 724.40)], None, '320/160', False),
    ('R-L-LAUNDRY', 'lower', 'כביסה', 'laundry',
     [(1224.76, 727.16), (1315.48, 727.16), (1315.48, 775.40), (1224.76, 775.40)], None, '320/170', False),
    ('R-L-FAMILY', 'lower', 'פינת משפחה', 'family',
     [(1318.24, 579.80), (1386.28, 579.80), (1386.28, 667.52), (1318.24, 667.52)], None, '240/310', False),
    ('R-L-BED2', 'lower', 'ח.שינה', 'bedroom',
     [(1389.16, 579.80), (1505.32, 579.80), (1505.32, 664.76), (1389.16, 664.76)], None, '410/300', False),
    ('R-L-BED3', 'lower', 'ח.שינה', 'bedroom',
     [(1423.12, 667.52), (1505.32, 667.52), (1505.32, 780.92), (1406.20, 780.92), (1406.20, 707.24),
      (1423.12, 707.24)], None, '290/400', False),
    ('R-L-BATH2', 'lower', 'מקלחת', 'bath',
     [(1355.20, 724.28), (1403.32, 724.28), (1403.32, 780.92), (1355.20, 780.92)], None, '170/200', False),
    ('R-L-HALL', 'lower', 'מבואה', 'hall',
     [(1318.36, 667.52), (1420.36, 667.52), (1420.36, 704.36), (1352.32, 704.36), (1352.32, 806.60),
      (1318.36, 806.60)], None, '360/130', False),
]

# Stairs (entrance-viewport coordinates; the stair core is identical on both plans)
# Risers of the two flights read from the orange (0.87,0.54,0.43) stair lines.
STAIR = {
    'id': 'ST-1',
    'footprint': [(431.44, 778.28), (536.32, 778.28), (536.32, 834.92), (431.44, 834.92)],
    # walking line from the lower floor (east end of the north flight) to the entrance hall
    'path': [(532.0, 792.44), (445.6, 792.44), (445.6, 820.76), (532.0, 820.76)],
    'width_pt': 28.32,
    'risers': 19,
}

# Section / elevation marks used by the overlay (page points)
DIMS = [
    ('entrance', '460', 428.56, 586.5, 559.00, 586.5),
    ('entrance', '340', 473.5, 568.52, 473.5, 664.88),
    ('entrance', '500', 578.80, 707.0, 720.52, 707.0),
    ('entrance', '800', 668.6, 656.36, 668.6, 883.16),
    ('entrance', '860', 476.80, 866.2, 720.52, 866.2),
    ('entrance', '490', 559.00, 982.9, 697.84, 982.9),
    ('entrance', '440', 668.6, 883.16, 668.6, 1007.84),
    ('entrance', '430', 431.44, 970.9, 553.24, 970.9),
    ('entrance', '300', 456.9, 951.08, 456.9, 1036.16),
    ('lower', '320', 1224.76, 644.3, 1315.48, 644.3),
    ('lower', '410', 1389.16, 639.5, 1505.32, 639.5),
    ('lower', '290', 1423.12, 728.0, 1505.32, 728.0),
]
