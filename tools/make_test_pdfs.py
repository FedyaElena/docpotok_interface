#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Создает временные PDF-счета doc1.pdf ... doc12.pdf в папке test-files/ по данным data/docs.js.
Нужны для проверки прототипа, пока нет настоящих счетов. Требуется: pip install reportlab"""
import json
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
CANDIDATES = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
]
for r, b in CANDIDATES:
    if Path(r).exists():
        pdfmetrics.registerFont(TTFont("F", r))
        pdfmetrics.registerFont(TTFont("FB", b))
        break
else:
    raise SystemExit("Не найден шрифт с кириллицей")

t = (ROOT / "data" / "docs.js").read_text(encoding="utf-8")
docs = json.loads(t[t.index("=") + 1:].strip().rstrip(";"))
out = ROOT / "test-files"
out.mkdir(exist_ok=True)


def m(n):
    return "{:,.2f}".format(n).replace(",", " ").replace(".", ",")


for d in docs:
    inv = d["invoice"]
    c = canvas.Canvas(str(out / (d["key"] + ".pdf")), pagesize=A4)
    W, H = A4
    y = H - 60
    c.setFont("FB", 14); c.drawString(50, y, "СЧЕТ-ФАКТУРА № %s от %s" % (inv["number"], inv["date"]))
    y -= 22; c.setFont("F", 9); c.setFillGray(.4); c.drawString(50, y, "Учебный образец. Данные вымышлены."); c.setFillGray(0)
    y -= 28; c.setFont("F", 10)
    for line in ["Продавец: " + inv["supplier"], "ИНН продавца: " + inv["inn"], "Покупатель: ООО «ТрансЛогистик»",
                 "ИНН покупателя: 7712345678", "Валюта: " + inv["currency"]]:
        c.drawString(50, y, line); y -= 15
    y -= 10
    c.setFont("FB", 9)
    c.drawString(50, y, "Наименование услуги"); c.drawString(300, y, "Объект"); c.drawRightString(W - 50, y, "Сумма без НДС")
    c.line(50, y - 4, W - 50, y - 4); y -= 18; c.setFont("F", 9)
    for r in d["rows"][:30]:
        if y < 150:
            break
        c.drawString(50, y, r["desc"]); c.drawString(300, y, r["transport"]); c.drawRightString(W - 50, y, m(r["amount"])); y -= 13
    y -= 12; c.setFont("F", 10)
    c.drawRightString(W - 50, y, "Итого без НДС: " + m(inv["net"])); y -= 15
    c.drawRightString(W - 50, y, "НДС %s%%: %s" % (inv["vatRate"], m(inv["vat"]))); y -= 15
    c.setFont("FB", 11); c.drawRightString(W - 50, y, "Всего к оплате: " + m(inv["total"]))
    c.save()
print("PDF созданы в", out)
