"""Downloads public-domain artwork from Wikimedia Commons into raw/, with a source.txt credit next to each file.

Run: python3 -I scripts/fetch-commons.py   (skips files that already exist)
"""
import json, os, time, urllib.parse, urllib.request

UA = "TheLivingCanvas/0.1 (local development build)"
MAX_WIDTH = 6000  # plenty for the loupe; Commons serves a resized copy of anything larger

# (output path without extension, Commons file title)
FILES = [
    ("raw/exhibits/davinci-last-supper/master", "File:Leonardo da Vinci (1452-1519) - The Last Supper (1495-1498).jpg"),
    ("raw/exhibits/michelangelo-creation-of-adam/master", "File:Michelangelo - Creation of Adam (cropped).jpg"),
    ("raw/exhibits/rembrandt-night-watch/master", "File:The Night Watch - HD.jpg"),
    ("raw/exhibits/vermeer-pearl-earring/master", "File:1665 Girl with a Pearl Earring.jpg"),
    ("raw/exhibits/goya-saturn/master", "File:Francisco de Goya, Saturno devorando a su hijo (1819-1823).jpg"),
    ("raw/exhibits/delacroix-liberty/master", "File:Eugène Delacroix - Le 28 Juillet. La Liberté guidant le peuple.jpg"),
    ("raw/exhibits/vangogh-starry-night/master", "File:Van Gogh - Starry Night - Google Art Project.jpg"),
    ("raw/exhibits/munch-scream/master", "File:Edvard Munch, 1893, The Scream, oil, tempera and pastel on cardboard, 91 x 73 cm, National Gallery of Norway.jpg"),
    # Artist portraits (self-portraits where they exist). Leonardo and Vermeer use images supplied by the project owner.
    ("raw/artists/michelangelo", "File:Miguel Ángel, por Daniele da Volterra (detalle).jpg"),
    ("raw/artists/rembrandt", "File:Rembrandt van Rijn - Self-Portrait - Google Art Project.jpg"),
    ("raw/artists/goya", "File:Autorretrato Goya 1815.jpg"),
    ("raw/artists/delacroix", "File:Autoportrait - Eugène Delacroix - Musée du Louvre Peintures RF 25.jpg"),
    ("raw/artists/vangogh", "File:Vincent van Gogh - Self-Portrait - Google Art Project (454045).jpg"),
    ("raw/artists/munch", "File:Edvard Munch - Self-Portrait with Cigarette - NG.M.00470 - National Museum of Art, Architecture and Design.jpg"),
]


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120)


def info(title):
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": title, "prop": "imageinfo",
        "iiprop": "url|size|extmetadata", "iiurlwidth": MAX_WIDTH,
        "iiextmetadatafilter": "LicenseShortName|Artist|ObjectName|Credit",
    })
    page = next(iter(json.load(get("https://commons.wikimedia.org/w/api.php?" + q))["query"]["pages"].values()))
    return page["imageinfo"][0]


for out, title in FILES:
    path = out + ".jpg"
    if os.path.exists(path):
        continue
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(5):
        try:
            ii = info(title)
            url = ii["thumburl"] if ii["width"] > MAX_WIDTH else ii["url"]
            with get(url) as r, open(path, "wb") as f:
                f.write(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(30 * (attempt + 1))  # Commons asked us to slow down
    meta = {k: v.get("value", "") for k, v in ii.get("extmetadata", {}).items()}
    with open(out + ".source.txt", "w") as f:
        f.write(f"{title}\nhttps://commons.wikimedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}\n"
                f"License: {meta.get('LicenseShortName', '?')}\nOriginal size: {ii['width']}x{ii['height']}\n")
    print("saved", path, os.path.getsize(path) // 1024, "KB")
    time.sleep(12)
