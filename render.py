from pathlib import Path
import math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import cairosvg

ROOT = Path(__file__).resolve().parent
FR = ROOT / "frames"
FR.mkdir(exist_ok=True)
W, H, FPS, DUR = 720, 1280, 15, 10
src = (ROOT / "octoopus-character.svg").read_text()

# Build high-resolution sprite variants. Rendering larger than the final canvas and
# downsampling AFTER rotation greatly reduces jagged SVG edges.
SCALE = 3
GAZES = {
    "center": (0, 0),
    "left": (-6, 1),
    "right": (6, 1),
    "up": (0, -4),
    "down": (0, 4),
}
def svg_variant(mouth, gaze):
    svg = src
    dx, dy = GAZES[gaze]
    for ident in ["R-pupil", "R-B-Light", "R-L-Light", "L-pupil", "L-B-Light", "L-L-Light"]:
        svg = svg.replace(f'<g id="{ident}">', f'<g id="{ident}" transform="translate({dx} {dy})">')
    if mouth == "open":
        svg = svg.replace('<g id="surprise" style="opacity:0">', '<g id="surprise" style="opacity:1">')
        svg = svg.replace('<path id="happy"', '<path id="happy" style="opacity:0"')
    elif mouth == "sad":
        svg = svg.replace('<path id="sad" style="opacity:0"', '<path id="sad" style="opacity:1"')
        svg = svg.replace('<path id="happy"', '<path id="happy" style="opacity:0"')
    return svg

mascots = {}
for gaze in GAZES:
    for mouth in ["closed", "open"]:
        key = (gaze, mouth)
        png = ROOT / f"sprite_{gaze}_{mouth}.png"
        cairosvg.svg2png(bytestring=svg_variant(mouth, gaze).encode(),
                         write_to=str(png), output_width=425*SCALE, output_height=472*SCALE)
        mascots[key] = Image.open(png).convert("RGBA")

font_path = "/usr/share/fonts/truetype/noto/NotoSansArabicUI-Regular.ttf"
font_bold = "/usr/share/fonts/truetype/noto/NotoSansArabicUI-Bold.ttf"
if not Path(font_bold).exists():
    font_bold = font_path
font_title = ImageFont.truetype(font_bold, 30)
font_kicker = ImageFont.truetype(font_bold, 17)
font_brand = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 11)
FULL = "سلام من اکتو هستم یک توسعه‌دهنده در اعماق!"
chars = list(FULL)

Y, X = np.mgrid[0:H, 0:W]
r = np.sqrt(((X - W / 2) / 1.1) ** 2 + (Y - 640) ** 2)
strength = np.clip(1 - r / 650, 0, 1) ** 2
arr = np.zeros((H, W, 3), dtype=np.uint8)
for c, (base_c, hi) in enumerate([(6, 18), (21, 51), (43, 72)]):
    arr[:, :, c] = np.clip(base_c + strength * (hi - base_c), 0, 255)
base = Image.fromarray(arr, "RGB").convert("RGBA")
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(grid, "RGBA")
for x in range(0, W, 72):
    d.line((x, 0, x, H), fill=(65, 250, 242, 7), width=1)
for y in range(0, H, 72):
    d.line((0, y, W, y), fill=(65, 250, 242, 7), width=1)
base = Image.alpha_composite(base, grid)
for x, y, rad in [(112, 460, 3), (585, 390, 2), (530, 800, 3), (145, 760, 2), (610, 650, 2), (92, 900, 2)]:
    lay = Image.new("RGBA", (W, H))
    ImageDraw.Draw(lay).ellipse((x-rad, y-rad, x+rad, y+rad), fill=(65, 250, 242, 170))
    lay = lay.filter(ImageFilter.GaussianBlur(5))
    base = Image.alpha_composite(base, lay)

for i in range(FPS * DUR):
    t = i / FPS
    im = base.copy()
    draw = ImageDraw.Draw(im, "RGBA")
    draw.text((W//2, 74), "OCTOOPUS  /  DEEP WEB", font=font_brand, fill=(220,244,255,145), anchor="mm", direction="ltr")
    draw.line((48,118,48,164), fill=(65,250,242,190), width=2)
    draw.text((62,118), "DEPTH 0042 M", font=font_small, fill=(65,250,242,185), anchor="lt", direction="ltr")
    draw.text((62,139), "SIGNAL FOUND", font=font_small, fill=(220,244,255,115), anchor="lt", direction="ltr")
    rise = max(0, min(1, (t-.35)/1.65))
    rise = 1 - (1-rise)**3
    bob = math.sin((t-2)*2.1)*4 if t > 2 else 0
    glow = Image.new("RGBA", (W,H))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((170,870,550,918), fill=(65,250,242,int(45*rise)))
    glow = glow.filter(ImageFilter.GaussianBlur(26))
    im = Image.alpha_composite(im, glow)
    op = max(0, min(1, (t-.25)/.6))
    scale = .90 + .10*rise
    talking = t > 2.7 and int((t-2.7)/.112) < len(chars)
    # Gaze changes at meaningful beats: entrance, greeting, then looking toward the text.
    if t < 1.45:
        gaze = "center"
    elif 2.1 < t < 2.8:
        gaze = "left"
    elif 5.8 < t < 6.55:
        gaze = "right"
    elif 7.4 < t < 8.0:
        gaze = "down"
    else:
        gaze = ["center", "up", "center", "right"][int(t*0.72) % 4]
    # Approximate syllabic mouth envelope; varies in speed and has short rests.
    phase = (t-2.7)*math.pi*2*(3.0 + 0.35*math.sin(t*0.9))
    mouth_open = (max(0.0, math.sin(phase)+0.12) ** 1.25) if talking else 0.0
    if talking and (int((t-2.7)*5.2) % 7 == 0):
        mouth_open *= 0.25
    closed = mascots[(gaze, "closed")]
    opened = mascots[(gaze, "open")]
    obj = Image.blend(closed, opened, min(0.88, mouth_open*0.82))
    # Resize and rotate at 3x resolution, then downsample only once.
    obj = obj.resize((int(425*scale*SCALE), int(472*scale*SCALE)), Image.Resampling.LANCZOS)
    obj = obj.rotate(math.sin(t*1.55)*1.05 if t > 1.5 else 0, resample=Image.Resampling.BICUBIC, expand=True)
    final_size = (max(1, round(obj.width/SCALE)), max(1, round(obj.height/SCALE)))
    obj = obj.resize(final_size, Image.Resampling.LANCZOS)
    y = int(420 + (1-rise)*500 + bob)
    if op < 1:
        obj.putalpha(obj.getchannel("A").point(lambda a: int(a*op)))
    im.alpha_composite(obj, ((W-obj.width)//2, y))
    m = max(0, min(1, (t-2)/.55))
    m = 1-(1-m)**3
    if m > 0:
        panel = Image.new("RGBA", (W,H))
        pd = ImageDraw.Draw(panel)
        pd.rounded_rectangle((68,180,652,370), radius=26, fill=(10,30,52,int(242*m)), outline=(65,250,242,int(120*m)), width=2)
        pd.polygon([(538,369),(570,369),(556,388)], fill=(10,30,52,int(242*m)))
        pd.text((W-102,216), "یک پیام از اعماق دریا", font=font_kicker, fill=(65,250,242,int(255*m)), anchor="ra", direction="rtl")
        count = max(0, min(len(chars), int((t-2.7)/.112)))
        line1, line2 = "سلام من اکتو هستم", "یک توسعه‌دهنده در اعماق!"
        l1, l2 = ("".join(chars[:count]), "") if count <= len(line1) else (line1, "".join(chars[len(line1):count]))
        pd.text((W-102,264), l1, font=font_title, fill=(244,251,255,int(255*m)), anchor="ra", direction="rtl", language="fa")
        pd.text((W-102,310), l2, font=font_title, fill=(244,251,255,int(255*m)), anchor="ra", direction="rtl", language="fa")
        if 2.7 < t < 2.7 + len(chars)*.112 + .2:
            blink = 210 if int(t*3)%2 == 0 else 60
            by = 263 if count <= len(line1) else 309
            pd.rounded_rectangle((W-95,by,W-92,by+32), radius=1, fill=(65,250,242,int(blink*m)))
        im = Image.alpha_composite(im, panel)
    sub = max(0, min(1, (t-9.5)/.7))
    sub = 1-(1-sub)**3
    if sub > 0:
        ImageDraw.Draw(im, "RGBA").text((W//2,1155), "هشت بازو؛ یک ذهن کنجکاو", font=font_kicker, fill=(215,240,255,int(190*sub)), anchor="mm", direction="rtl", language="fa")
    im.convert("RGB").save(FR/f"frame_{i:06d}.jpg", quality=92, subsampling=0)
    if i % 60 == 0:
        print("frame", i, flush=True)

# Synthetic whoosh and typing ticks. Voice-over is intentionally left for later.
sr = 44100
n = int(sr*DUR)
audio = np.zeros(n, dtype=np.float64)
rng = np.random.default_rng(13)
def add(sound, start, vol=1):
    j0 = max(0, int(start*sr)); j = min(n, j0+len(sound))
    if j > j0:
        audio[j0:j] += sound[:j-j0]*vol
def tone(freq, dur, decay=8):
    N = int(dur*sr); tt = np.arange(N)/sr
    return np.sin(2*np.pi*freq*tt)*np.exp(-decay*tt)
def noise(dur):
    N = int(dur*sr); x = rng.normal(0,1,N); x = np.convolve(x,np.ones(14)/14,mode="same")
    x = np.diff(np.r_[x[0],x]); x = x/(np.max(np.abs(x))+1e-9)
    return x*np.sin(np.linspace(0,math.pi,N))**1.6
add(noise(1.35), .48, .34)
add(tone(155,.22,13), 1.86, .18)
add(tone(310,.12,18), 1.91, .10)
for idx in range(0, len(chars), 2):
    add(tone(1150+(idx%4)*130,.026,100), 2.7+idx*.112, .075)
add(tone(660,.45,5), 2.7+len(chars)*.112, .09)
peak = np.max(np.abs(audio)); audio = audio/(max(1,peak/.88))
stereo = np.column_stack([audio,np.roll(audio,17)*.98])
with wave.open(str(ROOT/"sfx_mix.wav"),"wb") as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(sr)
    wf.writeframes((np.clip(stereo,-1,1)*32767).astype("<i2").tobytes())
subprocess.run(["ffmpeg","-y","-framerate",str(FPS),"-i",str(FR/"frame_%06d.jpg"),"-i",str(ROOT/"sfx_mix.wav"),"-r","30","-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart",str(ROOT/"octo_intro.mp4")],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
print("DONE", (ROOT/"octo_intro.mp4").stat().st_size)
