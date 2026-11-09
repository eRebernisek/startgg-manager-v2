from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
import json, sys
f = TTFont('/usr/share/fonts/google-noto/NotoSans-ExtraBoldItalic.ttf')
gs = f.getGlyphSet(); cmap = f.getBestCmap(); hmtx = f['hmtx']
text = 'SGG'
x = 0; parts = []
bp = BoundsPen(gs)
for ch in text:
    g = cmap[ord(ch)]
    gs[g].draw(TransformPen(bp, (1,0,0,1,x,0)))
    parts.append((g, x)); x += hmtx[g][0]
xmin,ymin,xmax,ymax = bp.bounds
pen = SVGPathPen(gs)
for g, ox in parts:
    gs[g].draw(TransformPen(pen, (1,0,0,-1,ox-xmin,ymax)))  # flip y, origin at top-left of ink box
w, h = xmax-xmin, ymax-ymin
json.dump({'d': pen.getCommands(), 'w': w, 'h': h}, open('mark.json','w'))
print(w, h)
