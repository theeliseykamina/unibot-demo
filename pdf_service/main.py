"""
UniBot Time2Race - PDF Generation Service
FastAPI + ReportLab
"""

from fastapi import FastAPI, Response
from pydantic import BaseModel
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from io import BytesIO
from datetime import datetime
import os

app = FastAPI(title="PDF Generator", version="1.0.0")

# Попробуем зарегистрировать шрифт с поддержкой кириллицы
FONT_REGISTERED = False
FONT_NAME = "Helvetica"  # fallback

def register_fonts():
    """Пытаемся зарегистрировать шрифт с кириллицей"""
    global FONT_REGISTERED, FONT_NAME
    
    # Пути где могут быть шрифты
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "C:/Windows/Fonts/arial.ttf",
    ]
    
    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont("CustomFont", font_path))
                FONT_NAME = "CustomFont"
                FONT_REGISTERED = True
                print(f"✅ Шрифт зарегистрирован: {font_path}")
                return
            except Exception as e:
                print(f"⚠️ Не удалось загрузить шрифт {font_path}: {e}")
    
    print("⚠️ Используем стандартный шрифт (кириллица может не отображаться)")


# Регистрируем шрифты при старте
register_fonts()


class ClientData(BaseModel):
    fio: str
    phone: str
    email: str
    birth_date: str
    submitted_at: str
    request_id: str = ""


def transliterate(text: str) -> str:
    """Транслитерация для случая если шрифт не поддерживает кириллицу"""
    translit_map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
        'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
        'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
        'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
        'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    }
    return ''.join(translit_map.get(c, c) for c in text)


def safe_text(text: str) -> str:
    """Возвращает текст для PDF - с транслитерацией если нет шрифта"""
    if FONT_REGISTERED:
        return text
    return transliterate(text)


@app.post("/generate_pdf")
async def generate_pdf(data: ClientData):
    """Генерирует PDF с данными клиента"""
    
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    
    # Цвета
    primary_color = HexColor("#667eea")
    text_color = HexColor("#333333")
    gray_color = HexColor("#666666")
    
    # === ШАПКА ===
    c.setFillColor(primary_color)
    c.rect(0, height - 80, width, 80, fill=True, stroke=False)
    
    c.setFillColor(HexColor("#ffffff"))
    c.setFont(FONT_NAME, 24)
    c.drawString(30, height - 50, safe_text("🏎️ Time2Race"))
    
    c.setFont(FONT_NAME, 12)
    c.drawString(30, height - 70, safe_text("Анкета клиента / Согласие на обработку ПД"))
    
    # === НОМЕР ЗАЯВКИ ===
    c.setFillColor(text_color)
    c.setFont(FONT_NAME, 10)
    c.drawRightString(width - 30, height - 50, f"ID: {data.request_id}")
    
    # Дата создания
    try:
        dt = datetime.fromisoformat(data.submitted_at.replace('Z', '+00:00'))
        date_str = dt.strftime("%d.%m.%Y %H:%M")
    except:
        date_str = data.submitted_at[:16]
    c.drawRightString(width - 30, height - 65, safe_text(f"Дата: {date_str}"))
    
    # === ДАННЫЕ КЛИЕНТА ===
    y = height - 130
    
    c.setFont(FONT_NAME, 14)
    c.setFillColor(primary_color)
    c.drawString(30, y, safe_text("Данные клиента"))
    
    y -= 30
    c.setFillColor(text_color)
    
    # Рисуем поля
    fields = [
        (safe_text("ФИО:"), safe_text(data.fio)),
        (safe_text("Телефон:"), data.phone),
        ("Email:", data.email),
        (safe_text("Дата рождения:"), data.birth_date),
    ]
    
    c.setFont(FONT_NAME, 11)
    for label, value in fields:
        c.setFillColor(gray_color)
        c.drawString(30, y, label)
        c.setFillColor(text_color)
        c.drawString(140, y, value)
        y -= 25
    
    # === СОГЛАСИЕ ===
    y -= 30
    c.setFont(FONT_NAME, 14)
    c.setFillColor(primary_color)
    c.drawString(30, y, safe_text("Согласие на обработку персональных данных"))
    
    y -= 25
    c.setFont(FONT_NAME, 10)
    c.setFillColor(text_color)
    
    consent_text = safe_text(
        "Я даю согласие на обработку моих персональных данных в соответствии с "
        "Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных» "
        "для целей оказания услуг компанией Time2Race."
    )
    
    # Перенос текста
    from reportlab.lib.utils import simpleSplit
    lines = simpleSplit(consent_text, FONT_NAME, 10, width - 60)
    for line in lines:
        c.drawString(30, y, line)
        y -= 15
    
    # === ПОДПИСЬ ===
    y -= 40
    c.setFont(FONT_NAME, 11)
    c.setFillColor(gray_color)
    c.drawString(30, y, safe_text("Подпись клиента: _______________________"))
    c.drawString(300, y, safe_text("Дата: _____________"))
    
    # === ПОДВАЛ ===
    c.setFont(FONT_NAME, 8)
    c.setFillColor(gray_color)
    c.drawString(30, 30, safe_text("Документ сформирован автоматически системой UniBot Time2Race"))
    c.drawRightString(width - 30, 30, safe_text(f"Страница 1 из 1"))
    
    c.save()
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=consent_{data.request_id}.pdf"
        }
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "pdf_generator", "font": FONT_NAME}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
