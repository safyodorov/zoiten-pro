import sys, json
data = json.load(sys.stdin)
cards = data.get("cards", [])
print(f"Got {len(cards)} cards")
clothing = [c for c in cards if c.get("brand") in ("Men's Factor", "Alverto")]
print(f"Clothing cards: {len(clothing)}")
if clothing:
    c = clothing[0]
    print("=== Card ===")
    print(c.get("brand"), "|", c.get("title", "")[:80])
    print()
    chars = c.get("characteristics", [])
    print(f"Total characteristics: {len(chars)}")
    print("=== Filtered (Пол/Цвет/Размер/Состав) ===")
    for x in chars:
        nm = x.get("name", "")
        if any(k in nm for k in ["Пол", "Цвет", "Размер", "Состав", "Материал"]):
            print(f"  [{x['id']:>9}] {nm:<40} → {json.dumps(x.get('value'), ensure_ascii=False)}")
    print()
    print("=== sizes ===")
    sizes = c.get("sizes", [])
    print(json.dumps([{"techSize": s.get("techSize"), "wbSize": s.get("wbSize")} for s in sizes], ensure_ascii=False, indent=2))
